const $ = id => document.getElementById(id);
const F = ['provider', 'key', 'geminiModel', 'orModel', 'ollamaModel', 'dailyLimit'];
const D = { provider: 'gemini', key: '', geminiModel: 'gemini-2.0-flash', orModel: 'meta-llama/llama-3.3-70b-instruct:free', ollamaModel: 'qwen2.5:7b', dailyLimit: 50, cache: true, proactive: false, sensitive: [] };
chrome.storage.local.get(Object.keys(D), v => {
  const c = { ...D, ...v };
  F.forEach(k => $(k).value = c[k]);
  $('cache').checked = !!c.cache; $('proactive').checked = !!c.proactive; $('sensitive').value = (c.sensitive || []).join('\n');
});
const say = t => $('out').textContent = t;
function collect() {
  const o = {}; F.forEach(k => o[k] = $(k).value.trim());
  o.dailyLimit = Math.max(5, +o.dailyLimit || 50); o.cache = $('cache').checked; o.proactive = $('proactive').checked;
  o.sensitive = $('sensitive').value.split('\n').map(s => s.trim()).filter(Boolean); return o;
}
$('save').onclick = () => chrome.storage.local.set(collect(), () => say('✅ ذخیره شد.'));
$('test').onclick = () => chrome.storage.local.set(collect(), () => {
  say('در حال آزمایش…');
  chrome.runtime.sendMessage({ type: 'llm', system: 'فقط JSON برگردان.', user: 'خروجی: {"ok":"سلام"}' }, r => say(r && r.ok ? '✅ اتصال برقرار است.' : '⚠️ ' + (r?.err || 'خطا')));
});
$('clear').onclick = () => { if (confirm('همه‌ی تنظیمات، کلید و کش پاک شود؟')) chrome.runtime.sendMessage({ type: 'clearAll' }, () => location.reload()); };
