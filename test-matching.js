// Quick validation — test URL matching logic from background.js

function stripWww(h) { return h.startsWith("www.") ? h.slice(4) : h; }

function matchesRule(url, rule) {
  if (!rule.enabled) return false;
  try {
    const parsed = new URL(url);
    switch (rule.type) {
      case "exact":  return new URL(url).href === new URL(rule.pattern).href;
      case "domain": {
        const urlHost = stripWww(parsed.hostname.toLowerCase());
        const ruleHost = stripWww(rule.pattern.toLowerCase().trim());
        return urlHost === ruleHost || urlHost.endsWith("." + ruleHost);
      }
      case "regex": { try { return new RegExp(rule.pattern, "i").test(url); } catch { return false; } }
      case "keyword": return url.toLowerCase().includes(rule.pattern.toLowerCase());
      default: return false;
    }
  } catch { return false; }
}

const tests = [
  [matchesRule("https://youtube.com/watch?v=abc", {type:"domain",pattern:"youtube.com",enabled:true}),  true,  "domain match"],
  [matchesRule("https://www.youtube.com/",         {type:"domain",pattern:"youtube.com",enabled:true}),  true,  "www prefix stripped"],
  [matchesRule("https://sub.youtube.com/",         {type:"domain",pattern:"youtube.com",enabled:true}),  true,  "subdomain match"],
  [matchesRule("https://notyoutube.com/",          {type:"domain",pattern:"youtube.com",enabled:true}),  false, "no false positive"],
  [matchesRule("https://reddit.com/",              {type:"regex", pattern:"(?:reddit|twitter)\\.com", enabled:true}), true, "regex reddit"],
  [matchesRule("https://twitter.com/",             {type:"regex", pattern:"(?:reddit|twitter)\\.com", enabled:true}), true, "regex twitter"],
  [matchesRule("https://safe.com/",                {type:"regex", pattern:"(?:reddit|twitter)\\.com", enabled:true}), false,"regex no match"],
  [matchesRule("https://example.com/casino-games", {type:"keyword",pattern:"casino",enabled:true}),    true,  "keyword match"],
  [matchesRule("https://example.com/",             {type:"keyword",pattern:"casino",enabled:true}),    false, "keyword no match"],
  [matchesRule("https://youtube.com/",             {type:"domain",pattern:"youtube.com",enabled:false}),false, "disabled rule"],
  [matchesRule("https://example.com/page",         {type:"exact", pattern:"https://example.com/page",enabled:true}), true,  "exact match"],
  [matchesRule("https://example.com/other",        {type:"exact", pattern:"https://example.com/page",enabled:true}), false, "exact no match"],
];

let pass = 0, fail = 0;
tests.forEach(([got, want, name]) => {
  if (got === want) { console.log("✓", name); pass++; }
  else { console.log("✗", name, "— got", got, "want", want); fail++; }
});
console.log(fail === 0 ? "\nAll " + pass + " tests passed." : "\n" + fail + " FAILED");
