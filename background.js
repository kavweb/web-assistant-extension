// پس‌زمینه: تنها جایی که کلید API را می‌بیند و با مدل صحبت می‌کند.
const DEF = {
  provider: 'gemini',
  geminiModel: 'gemini-2.0-flash',
  orModel: 'meta-llama/llama-3.3-70b-instruct:free',
  ollamaModel: 'qwen2.5:7b',
  key: '', dailyLimit: 50, cache: true
};
const store = {
  get: k => new Promise(r => chrome.storage.local.get(k, r)),
  set: o => new Promise(r => chrome.storage.local.set(o, r))
};
const today = () => new Date().toISOString().slice(0, 10);
const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
function parseJSON(t) {
  t = String(t).replace(/```json|```/g, '').trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  return JSON.parse(t.slice(a, b + 1));
}
async function cfg() { return { ...DEF, ...(await store.get(Object.keys(DEF))) }; }
async function usage() {
  const { usage: u } = await store.get('usage');
  return u && u.day === today() ? u : { day: today(), n: 0 };
}

async function callModel(c, system, user) {
  let res, j;
  if (c.provider === 'gemini') {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${c.geminiModel}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': c.key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.2 }
      })
    });
    if (!res.ok) throw httpErr(res);
    j = await res.json();
    return j.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }
  if (c.provider === 'openrouter') {
    res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + c.key },
      body: JSON.stringify({
        model: c.orModel, temperature: 0.2,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }]
      })
    });
    if (!res.ok) throw httpErr(res);
    j = await res.json();
    return j.choices?.[0]?.message?.content || '';
  }
  // ollama (محلی و کاملاً خصوصی)
  res = await fetch('http://localhost:11434/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: c.ollamaModel, stream: false, format: 'json',
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }]
    })
  });
  if (!res.ok) throw httpErr(res);
  j = await res.json();
  return j.message?.content || '';
}
function httpErr(res) {
  if (res.status === 429) return new Error('سهمیه‌ی رایگان مدل فعلاً تمام شده. کمی بعد دوباره امتحان کنید.');
  if (res.status === 400 || res.status === 401 || res.status === 403) return new Error('کلید API یا نام مدل درست نیست. تنظیمات را بررسی کنید.');
  return new Error('خطای سرویس مدل (' + res.status + ')');
}

async function handle(m) {
  if (m.type === 'state') {
    const c = await cfg(), u = await usage();
    return { ok: true, used: u.n, limit: c.dailyLimit, hasKey: c.provider === 'ollama' || !!c.key };
  }
  if (m.type === 'options') { chrome.runtime.openOptionsPage(); return { ok: true }; }
  if (m.type === 'clearAll') { await chrome.storage.local.clear(); return { ok: true }; }
  if (m.type === 'llm') {
    const c = await cfg();
    if (c.provider !== 'ollama' && !c.key) return { ok: false, err: 'هنوز کلید API نگذاشته‌اید. از تنظیمات یک کلید رایگان وارد کنید.' };
    const ck = hash(m.system + m.user);
    if (m.cache && c.cache) {
      const { cache = {} } = await store.get('cache');
      const hit = cache[ck];
      if (hit && Date.now() - hit.ts < 7 * 864e5) return { ok: true, data: hit.d, cached: true };
    }
    const u = await usage();
    if (u.n >= c.dailyLimit) return { ok: false, err: `سقف مصرف امروز (${c.dailyLimit} درخواست) پر شده. فردا دوباره، یا سقف را در تنظیمات بالا ببرید.` };
    try {
      const data = parseJSON(await callModel(c, m.system, m.user));
      u.n++; await store.set({ usage: u });
      if (m.cache && c.cache) {
        const { cache = {} } = await store.get('cache');
        cache[ck] = { d: data, ts: Date.now() };
        const keep = Object.entries(cache).sort((a, b) => b[1].ts - a[1].ts).slice(0, 60);
        await store.set({ cache: Object.fromEntries(keep) });
      }
      return { ok: true, data };
    } catch (e) {
      return { ok: false, err: e instanceof SyntaxError ? 'پاسخ مدل قابل‌خواندن نبود. دوباره امتحان کنید.' : e.message };
    }
  }
  return { ok: false, err: 'نامعتبر' };
}
chrome.runtime.onMessage.addListener((m, s, send) => { handle(m).then(send); return true; });
chrome.action.onClicked.addListener(tab => { if (tab.id) chrome.tabs.sendMessage(tab.id, { type: 'toggle' }, () => void chrome.runtime.lastError); });
