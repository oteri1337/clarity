/* Food Reference — app logic
 * Data comes from food-data.json; markup and styling live in nutrient-table.html.
 * Loaded with `defer`, so the DOM is parsed before this runs.
 */
// Data lives in food-data.json so it can be edited without touching the page.
// Everything below runs only once it has loaded; boot() is hoisted, so the
// fetch can reference it before the definition appears.
fetch('food-data.json?v=36')
  .then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
  .then(boot)
  .catch(err=>{
    const msg = location.protocol==='file:'
      ? 'This page loads its data from <b>food-data.json</b>, and browsers block that over file://. '
        + 'Serve the folder over HTTP instead — e.g. <code>python3 -m http.server</code> in this directory, '
        + 'then open <code>http://localhost:8000/</code>.'
      : 'Could not load <b>food-data.json</b> ('+err.message+'). Check that it sits next to this page.';
    document.getElementById('body').innerHTML =
      '<tr><td colspan="40" class="mylist-empty">'+msg+'</td></tr>';
    console.error('food-data.json failed to load:', err);
  });

function boot(data){


const thresh={sodium:120,phos:100,oxal:10};
// Three independent sort states — one per table
// every table opens sorted by name, A at the top
let sortK={my:"name",main:"name",spice:"name",milk:"name"},sortDir={my:1,main:1,spice:1,milk:1};
const CATS_KEY='nutrient-hidden-cats';
let hiddenCats=new Set(),q="";
try{
  const stored=localStorage.getItem(CATS_KEY);
  if(stored) hiddenCats=new Set(JSON.parse(stored));
}catch(e){}
// cooking options (cooked / air-fried / oil-fried, each for meat and for fish) hidden by the cooking filter
const METHODS_KEY='nutrient-hidden-methods';
let hiddenMethods=new Set();
try{
  const stored=localStorage.getItem(METHODS_KEY);
  // older saves hid a method for meat and fish together, e.g. "oil-fried"
  if(stored) hiddenMethods=new Set(JSON.parse(stored).flatMap(m=>/-(meat|fish)$/.test(m)?[m]:[m+'-meat',m+'-fish']));
}catch(e){}
const saveMethods=()=>{ try{ localStorage.setItem(METHODS_KEY,JSON.stringify([...hiddenMethods])); }catch(e){} };

const body=document.getElementById("body");
const mylistBody=document.getElementById("mylist-body");
const spiceBody=document.getElementById("spice-body");
const mylistCount=document.getElementById("mylist-count");
const mylistHint=document.getElementById("mylist-hint");
const spiceCount=document.getElementById("spice-count");
const milkBody=document.getElementById("milk-body");
const milkCount=document.getElementById("milk-count");

// how each meat or fish entry is cooked, read from its name — drives the cooking filter,
// e.g. "oil-fried-fish". Meat covers poultry and eggs; fish covers shellfish and snail.
// Grilled, canned, dried and smoked entries have none, so the filter leaves them alone.
data.forEach(d=>{
  if(d.cat!=='animal'&&d.cat!=='fish') return;
  const m=/air-fried/.test(d.name)?'air-fried':/oil-fried/.test(d.name)?'oil-fried'
    :/cooked|boiled/.test(d.name)?'cooked':null;
  d.method=m && m+(d.cat==='fish'?'-fish':'-meat');
});

// kcal/g is derived, so milks (label figures only) leave it blank
data.forEach(d=>{ d.dens = (d.kcal!=null && d.cat!=='milk') ? +(d.kcal/(d.per||100)).toFixed(2) : null; });

// Milks show what ONE serving gives you: a sachet or bottle is one serving, a family tin
// is one glass made up. Labels print per 100 g/ml (or per `per`), so scale to the serving.
// "<0.5"-style label figures stay strings and keep their "<".
const MILK_AS_IS=new Set(['name','cat','form','fat','serving','size','unit','per','dens','gi']);
data.filter(d=>d.cat==='milk').forEach(d=>{
  const f=d.size/(d.per||100);
  Object.keys(d).forEach(k=>{
    const v=d[k];
    if(MILK_AS_IS.has(k)||v==null) return;
    if(typeof v==='number') d[k]=+(v*f).toPrecision(3);
    else if(/^<[\d.]+$/.test(v)) d[k]='<'+ +(parseFloat(v.slice(1))*f).toPrecision(2);
  });
});

// Collapsible UI — each toggle remembers its own state via localStorage, in-memory otherwise
function wireToggle(btnId, storageKey, defaultOpen, apply){
  const btn=document.getElementById(btnId);
  let open=defaultOpen;
  try{
    const stored=localStorage.getItem(storageKey);
    if(stored!==null) open=(stored==='1');
  }catch(e){}
  function sync(){
    btn.classList.toggle("collapsed",!open);
    btn.setAttribute("aria-expanded",open?"true":"false");
    apply(open);
  }
  btn.addEventListener("click",()=>{
    open=!open;
    sync();
    try{ localStorage.setItem(storageKey,open?'1':'0'); }catch(e){}
  });
  sync();
}
const hide=(id,open)=>document.getElementById(id).classList.toggle("hidden",!open);

// Protein calculator, Nutrient guide, Weight control and Hunger control are switched off:
// their buttons carry `hidden` in the HTML and their panels are forced shut here (even for
// visitors who had one open before). The guide cards stay in the page because the hover
// tooltips read from them. To bring one back, remove `hidden` from its button and restore
// e.g. wireToggle("keytoggle","nutrient-guide-open",false,o=>hide("key",o));
['calcpanel','key','weightpanel','hungerpanel'].forEach(id=>hide(id,false));
wireToggle("caltoggle",   "nutrient-calories-open", false, o=>hide("caldiagram",o));
wireToggle("carbtoggle",  "nutrient-carbs-open",  false, o=>hide("carbdiagram",o));
// My List is switched off (button hidden in the HTML); keep its section shut
hide("mylist-section",false);
wireToggle("foodtoggle",  "nutrient-foods-open",  true,  o=>hide("food-section",o));
wireToggle("milktoggle",  "nutrient-milk-open",   false, o=>hide("milk-section",o));
wireToggle("spicetoggle", "nutrient-spice-open",  false, o=>hide("spice-section",o));

// Favorites — persisted via localStorage when available, in-memory otherwise
const FAV_KEY='nutrient-favorites';
let favorites=new Set();
try{
  const stored=localStorage.getItem(FAV_KEY);
  if(stored) favorites=new Set(JSON.parse(stored));
}catch(e){}
// foods that were renamed — carry their stars over to the new name
const RENAMED={"Marvel Skimmed Milk (powder)": "Marvel Skimmed (powder)", "Peak Full Cream Milk (powder)": "Peak Full Cream (powder)", "Peak / Hollandia evaporated milk (full cream)": "Peak / Hollandia evaporated (full cream)", "Three Crowns (filled evaporated milk)": "Three Crowns (filled evaporated)", "Cowbell / Loya (filled milk powder)": "Cowbell / Loya (filled powder)", "Hollandia UHT milk (full cream)": "Hollandia UHT (full cream)", "Nono / nunu (fermented cow milk)": "Nono / nunu (fermented)", "Vitamilk (soy milk, sweetened)": "Vitamilk (soy, sweetened)", "Nutri-Milk (CWAY, flavoured milk drink)": "Nutri-Milk (CWAY, flavoured drink)", "Fried chicken (bone-in, fried)": "Chicken drumstick (oil-fried)", "Fried beef (cooked, fried)": "Cow meat / beef (lean, oil-fried)", "Fried Titus (mackerel, fried)": "Fish: Mackerel / Titus (oil-fried)", "Fried croaker (fried)": "Fish: Croaker (fresh, oil-fried)", "Fried kpanla (hake, fried)": "Fish: Kpanla / hake (oil-fried)", "Fried gizzard (peppered)": "Chicken gizzard (oil-fried)", "Fried turkey (skin-on)": "Turkey wing (oil-fried, skin-on)", "Fried snail (peppered)": "Snail (oil-fried)", "Egg (whole)": "Egg (whole, boiled)", "Egg whites": "Egg whites (boiled)", "Shrimp": "Shrimp (cooked)", "Crab (fresh)": "Crab (cooked)", "Tuna (cooked)": "Fish: Tuna (cooked)", "Tuna (air-fried)": "Fish: Tuna (air-fried)", "Tuna (oil-fried)": "Fish: Tuna (oil-fried)", "Tilapia (cooked)": "Fish: Tilapia (cooked)", "Tilapia (air-fried)": "Fish: Tilapia (air-fried)", "Tilapia (oil-fried)": "Fish: Tilapia (oil-fried)", "Lean beef (cooked)": "Cow meat / beef (lean, cooked)", "Lean beef (air-fried)": "Cow meat / beef (lean, air-fried)", "Lean beef (oil-fried)": "Cow meat / beef (lean, oil-fried)", "Shaki / cow tripe (cooked)": "Cow tripe / shaki (cooked)", "Shaki / cow tripe (air-fried)": "Cow tripe / shaki (air-fried)", "Shaki / cow tripe (oil-fried)": "Cow tripe / shaki (oil-fried)", "Ponmo / cow skin (cooked)": "Cow skin / ponmo (cooked)", "Ponmo / cow skin (air-fried)": "Cow skin / ponmo (air-fried)", "Ponmo / cow skin (oil-fried)": "Cow skin / ponmo (oil-fried)", "Roundabout / intestine (cooked)": "Cow intestine / roundabout (cooked)", "Roundabout / intestine (air-fried)": "Cow intestine / roundabout (air-fried)", "Roundabout / intestine (oil-fried)": "Cow intestine / roundabout (oil-fried)", "Bokoto / cow leg (cooked)": "Cow leg / bokoto (cooked)", "Bokoto / cow leg (air-fried)": "Cow leg / bokoto (air-fried)", "Bokoto / cow leg (oil-fried)": "Cow leg / bokoto (oil-fried)", "Suya (grilled beef)": "Cow meat / suya (grilled)", "Salmon (cooked)": "Fish: Salmon (cooked)", "Salmon (air-fried)": "Fish: Salmon (air-fried)", "Salmon (oil-fried)": "Fish: Salmon (oil-fried)", "Mackerel / Titus (cooked)": "Fish: Mackerel / Titus (cooked)", "Mackerel / Titus (air-fried)": "Fish: Mackerel / Titus (air-fried)", "Mackerel / Titus (oil-fried)": "Fish: Mackerel / Titus (oil-fried)", "Trout (cooked)": "Fish: Trout (cooked)", "Trout (air-fried)": "Fish: Trout (air-fried)", "Trout (oil-fried)": "Fish: Trout (oil-fried)", "Herring (cooked)": "Fish: Herring (cooked)", "Herring (air-fried)": "Fish: Herring (air-fried)", "Herring (oil-fried)": "Fish: Herring (oil-fried)", "Sardines (canned, drained)": "Fish: Sardines (canned, drained)", "Cod (cooked)": "Fish: Cod (cooked)", "Cod (air-fried)": "Fish: Cod (air-fried)", "Cod (oil-fried)": "Fish: Cod (oil-fried)", "Catfish (fresh, cooked)": "Fish: Catfish (fresh, cooked)", "Catfish (fresh, air-fried)": "Fish: Catfish (fresh, air-fried)", "Catfish (fresh, oil-fried)": "Fish: Catfish (fresh, oil-fried)", "Croaker (fresh, cooked)": "Fish: Croaker (fresh, cooked)", "Croaker (fresh, air-fried)": "Fish: Croaker (fresh, air-fried)", "Croaker (fresh, oil-fried)": "Fish: Croaker (fresh, oil-fried)", "Kpanla / hake (cooked)": "Fish: Kpanla / hake (cooked)", "Kpanla / hake (air-fried)": "Fish: Kpanla / hake (air-fried)", "Kpanla / hake (oil-fried)": "Fish: Kpanla / hake (oil-fried)", "Red snapper (fresh, cooked)": "Fish: Red snapper (fresh, cooked)", "Red snapper (fresh, air-fried)": "Fish: Red snapper (fresh, air-fried)", "Red snapper (fresh, oil-fried)": "Fish: Red snapper (fresh, oil-fried)", "Kpanla / hake (dried)": "Fish: Dried kpanla / hake", "Bonga / shawa (smoked)": "Fish: Bonga / shawa (smoked)", "Stockfish / okporoko (dried cod)": "Fish: Dried stockfish / okporoko (cod)", "Corned beef (canned)": "Cow meat / corned beef (canned)", "Chicken wings (with skin, cooked)": "Chicken wings (cooked)", "Chicken wings (with skin, air-fried)": "Chicken wings (air-fried)", "Chicken wings (with skin, oil-fried)": "Chicken wings (oil-fried)", "Chicken drumstick (cooked, skin-on)": "Chicken drumstick (cooked)", "Chicken drumstick (air-fried, skin-on)": "Chicken drumstick (air-fried)", "Chicken drumstick (oil-fried, skin-on)": "Chicken drumstick (oil-fried)", "Chicken breast (cooked)": "Chicken breast (cooked, skinless)", "Chicken breast (air-fried)": "Chicken breast (air-fried, skinless)", "Chicken breast (oil-fried)": "Chicken breast (oil-fried, skinless)", "Egusi seeds (melon, dry)": "Dry egusi seeds (melon)", "Ogbono seeds (dry)": "Dry ogbono seeds", "Pumpkin seeds (dry)": "Dry pumpkin seeds", "Chia seeds (dry)": "Dry chia seeds", "Quaker Quick Cooking Oats (dry)": "Dry Quaker Quick Cooking Oats", "Garri — yellow (dry, palm oil)": "Dry garri — yellow (palm oil)", "Garri — white (dry)": "Dry garri — white", "Semovita (wheat, dry)": "Dry semovita (wheat)", "Fish: Kpanla / hake (dried)": "Fish: Dried kpanla / hake", "Fish: Stockfish / okporoko (dried cod)": "Fish: Dried stockfish / okporoko (cod)", "Crayfish (dried, ground)": "Dried crayfish (ground)", "Brazil nuts (dried)": "Dried Brazil nuts", "Tiger nuts (dried)": "Dried tiger nuts", "Oregano (dried)": "Dried oregano", "Thyme (dried)": "Dried thyme"};
if(Object.entries(RENAMED).filter(([o,n])=>favorites.delete(o)&&favorites.add(n)).length) saveFavs();
function saveFavs(){
  try{ localStorage.setItem(FAV_KEY,JSON.stringify([...favorites])); }catch(e){}
}
function toggleFav(name){
  if(favorites.has(name)) favorites.delete(name);
  else favorites.add(name);
  saveFavs();
  render();
}
window.toggleFav=toggleFav;

const LABEL={kcal:"calories",dens:"kcal/g",fruct:"fructose",gi:"glycemic index",aox:"antioxidants",potk:"potassium",nitr:"nitrate",calc:"calcium",iron:"iron",magn:"magnesium",vitc:"vitamin C",vitb12:"vitamin B12",zinc:"zinc",choline:"choline",vita:"vitamin A",vitb6:"vitamin B6",mang:"manganese",merc:"mercury",selen:"selenium",iodine:"iodine",vitd:"vitamin D",vite:"vitamin E",vitb1:"vitamin B1",vitk:"vitamin K1",folate:"folate",mufa:"MUFA",protein:"protein",solfib:"fibre (soluble)",insfib:"fibre (insoluble)",omega3:"omega-3",omega6:"omega-6",satfat:"sat fat",trans:"trans fat",sodium:"sodium",chol:"cholesterol",purine:"purines",phos:"phosphorus",oxal:"oxalate",name:"food"};
const lbl=k=>LABEL[k]||k;
const HI = {dens:4, nitr:100, vita:150, vitb6:0.3, mang:0.5, merc:10, choline:70, zinc:2, selen:20, iodine:30, vitd:2, vite:3, vitb1:0.2, vitb12:1, iron:3, magn:100, vitc:30, vitk:60, folate:80, fruct:10, gi:70, sodium:300, potk:350, protein:15, phos:200, satfat:5, oxal:50, solfib:2, insfib:4, omega3:1, omega6:5, kcal:400, aox:5000, mufa:20, trans:0.5, calc:150, chol:100, purine:200};

// ---- Column show/hide ----------------------------------------------------
// One dynamically-rewritten stylesheet hides th[data-k] + td.c-<key> across ALL
// three tables at once, and survives buildRow re-renders (it's CSS, not inline).
const COLS_KEY='nutrient-hidden-cols-v2';
const colStyle=document.createElement('style');
document.head.appendChild(colStyle);
// First visit shows only these four; everything else starts hidden.
const DEFAULT_SHOWN=['kcal','sodium','satfat','gi'];
let hiddenCols=null;          // resolved below, once colKeys is known
try{
  const stored=localStorage.getItem(COLS_KEY);
  if(stored) hiddenCols=new Set(JSON.parse(stored));
  else{
    // a save from before sat fat and glycemic index joined the defaults: keep it, but show those
    const old=localStorage.getItem('nutrient-hidden-cols');
    if(old) hiddenCols=new Set(JSON.parse(old).filter(k=>!DEFAULT_SHOWN.includes(k)));
  }
}catch(e){}

// every column except the food name (which is the row identifier — never hideable),
// listed alphabetically by display label rather than in table order
const colKeys=[...document.querySelectorAll('#tbl thead th')]
  .map(th=>th.getAttribute('data-k'))
  .filter(k=>k && k!=='name')
  .sort((a,b)=>lbl(a).localeCompare(lbl(b),undefined,{numeric:true,sensitivity:'base'}));

// nutrients you generally want more of; everything else is limit-or-watch
const GOOD_COLS=new Set(['aox','calc','magn','iron','solfib','insfib','folate','vitc','vitb12','choline','nitr','vita','vitb6','mang','zinc','selen','iodine','vitd','vite','vitb1','mufa','omega3','potk','protein','vitk']);
// the eat-more nutrients that lead, in this order, both the Eat more dropdown and the food table
const EAT_MORE_LEAD=['nitr','potk','magn','calc','solfib','insfib','aox','omega3','mufa'];
if(!hiddenCols) hiddenCols=new Set(colKeys.filter(k=>!DEFAULT_SHOWN.includes(k)));
const GRIDS={good:document.getElementById('colgrid-good'), limit:document.getElementById('colgrid-limit')};
const groupKeys={good:[], limit:[]};
const saveCols=()=>{ try{ localStorage.setItem(COLS_KEY,JSON.stringify([...hiddenCols])); }catch(e){} };

colKeys.forEach(k=>{
  const g=GOOD_COLS.has(k)?'good':'limit';
  groupKeys[g].push(k);
  const chip=document.createElement('button');
  chip.className='colchip';
  chip.dataset.k=k;
  chip.textContent=lbl(k);
  chip.addEventListener('click',()=>{
    if(hiddenCols.has(k)) hiddenCols.delete(k); else hiddenCols.add(k);
    applyColHide(); saveCols();
  });
  GRIDS[g].appendChild(chip);
});

// one "all" toggle per row — same rule as the category chips:
// everything in the group shown -> hide the group; anything hidden -> show the group
Object.keys(GRIDS).forEach(g=>{
  const btn=document.createElement('button');
  btn.className='colchip colall';
  btn.dataset.group=g;
  btn.textContent='all';
  btn.addEventListener('click',()=>{
    const keys=groupKeys[g];
    if(keys.every(k=>!hiddenCols.has(k))) keys.forEach(k=>hiddenCols.add(k));
    else keys.forEach(k=>hiddenCols.delete(k));
    applyColHide(); saveCols();
  });
  GRIDS[g].appendChild(btn);
});

function applyColHide(){
  const sel=[...hiddenCols].flatMap(k=>[`th[data-k="${k}"]`,`td.c-${k}`]).join(',');
  colStyle.textContent = sel ? sel+'{display:none;}' : '';
  document.querySelectorAll('.colchip[data-k]').forEach(chip=>{
    chip.classList.toggle('off', hiddenCols.has(chip.dataset.k));
  });
  document.querySelectorAll('.colall').forEach(btn=>{
    const keys=groupKeys[btn.dataset.group];
    const hidden=keys.filter(k=>hiddenCols.has(k)).length;
    btn.classList.toggle('off', hidden===keys.length);
    btn.classList.toggle('partial', hidden>0 && hidden<keys.length);
  });
  if(typeof syncMenus==='function') syncMenus();
}
applyColHide();



// ---- Protein calculator --------------------------------------------------
// Standard g/kg bands from sports-nutrition guidance. The RDA (0.8) is the
// floor for avoiding deficiency, not an optimum — hence the framing below.
const BANDS=[
  {k:'Sedentary',      lo:0.8, hi:1.0, who:'Little or no training. 0.8 g/kg is the official RDA — the amount that prevents deficiency, which is a lower bar than the amount that is ideal.'},
  {k:'Active',         lo:1.2, hi:1.6, who:'Regular training, physical work, or eating in a deficit. Higher intake protects muscle when calories are down.'},
  {k:'Building muscle',lo:1.6, hi:2.2, who:'Resistance training with the goal of adding muscle. Past roughly 2.2 g/kg the evidence shows no further benefit.'}
];
const bwInput=document.getElementById('bw');
const calcOut=document.getElementById('calcout');
const unitBtns=[...document.querySelectorAll('.unitbtn')];
const BW_KEY='nutrient-bodyweight', BU_KEY='nutrient-bwunit';
let bwUnit='kg';

function renderCalc(){
  const raw=parseFloat(bwInput.value);
  if(!raw||raw<=0){
    calcOut.innerHTML=BANDS.map(b=>`<div class="calccard">
      <h4>${b.k}</h4>
      <div class="amt">${b.lo}–${b.hi} <span style="font-size:12px">g/kg</span></div>
      <div class="per">enter a weight above for your daily total</div>
      <div class="who">${b.who}</div>
    </div>`).join('');
    return;
  }
  const kg = bwUnit==='lb' ? raw*0.453592 : raw;
  calcOut.innerHTML=BANDS.map(b=>{
    const lo=Math.round(kg*b.lo), hi=Math.round(kg*b.hi);
    return `<div class="calccard">
      <h4>${b.k}</h4>
      <div class="amt">${lo}–${hi} g</div>
      <div class="per">${b.lo}–${b.hi} g per kg</div>
      <div class="who">${b.who}</div>
    </div>`;
  }).join('');
}
function saveBw(){
  try{
    localStorage.setItem(BW_KEY, bwInput.value);
    localStorage.setItem(BU_KEY, bwUnit);
  }catch(e){}
}
unitBtns.forEach(b=>b.addEventListener('click',()=>{
  const to=b.dataset.unit;
  const cur=parseFloat(bwInput.value);
  if(cur>0 && to!==bwUnit) bwInput.value=Math.round(to==='lb'?cur/0.453592:cur*0.453592);
  bwUnit=to;
  unitBtns.forEach(x=>x.classList.toggle('on',x.dataset.unit===to));
  renderCalc(); saveBw();
}));
bwInput.addEventListener('input',()=>{ renderCalc(); saveBw(); });
try{
  const u=localStorage.getItem(BU_KEY); if(u) bwUnit=u;
  const v=localStorage.getItem(BW_KEY); if(v) bwInput.value=v;
}catch(e){}
unitBtns.forEach(x=>x.classList.toggle('on',x.dataset.unit===bwUnit));
renderCalc();


// ---- Dropdown menus -----------------------------------------------------
// These mirror the (now hidden) chip rows rather than replacing their logic:
// each option forwards its click to the real chip, so filtering, persistence
// and the tri-state maths all keep working untouched.
let menuForwarding=false;
function buildMenus(){
  const build=(panelId, chips, kind)=>{
    const pan=document.getElementById(panelId);
    if(!pan) return;
    pan.innerHTML='';
    // A–Z by visible label (numeric-aware so B6 sits before B12); "all" always last
    const isAllChip=ch=>ch.dataset.cat==='all' || ch.classList.contains('colall');
    const isMethod=ch=>!!ch.dataset.method;   // cooking options keep their own order
    const az=(a,b)=>a.textContent.trim().localeCompare(b.textContent.trim(),undefined,{numeric:true,sensitivity:'base'});
    chips=[...chips.filter(c=>!isAllChip(c)&&!isMethod(c)).sort(az), ...chips.filter(isMethod), ...chips.filter(isAllChip)];
    chips.forEach(ch=>{
      const isAll = ch.dataset.cat==='all' || ch.classList.contains('colall');
      if(isAll){ pan.appendChild(Object.assign(document.createElement('div'),{className:'msep'})); }
      if(isMethod(ch) && !pan.querySelector('.mhead')){
        pan.appendChild(Object.assign(document.createElement('div'),{className:'msep'}));
        pan.appendChild(Object.assign(document.createElement('div'),{className:'mhead',textContent:'Meat & fish cooking'}));
      }
      const o=document.createElement('div');
      o.className='mopt'+(isAll?' mall':'');
      o.innerHTML='<span class="mbox"></span><span>'+ch.textContent.trim()+'</span>'
                 +'<button class="minfo" type="button" aria-label="what is this">i</button>';
      o.addEventListener('click',e=>{
        e.stopPropagation();
        menuForwarding=true;      // ch.click() bubbles to document; don't let it close the menu
        ch.click();
        menuForwarding=false;
        syncMenus();
      });
      o._chip=ch;
      pan.appendChild(o);
    });
  };
  build('pan-cat', [...document.querySelectorAll('.controls .chip')], 'cat');
  build('pan-good', [...document.querySelectorAll('#colgrid-good .colchip')], 'good');
  build('pan-limit',[...document.querySelectorAll('#colgrid-limit .colchip')],'limit');
  // tooltips are bound later, once cardHTML and CAT_GUIDE exist
}
// the chips they mirror are hidden, so re-attach the hover guides to the options
function tipFor(o){
  const c=o._chip; if(!c) return null;
  if(c.dataset.k) return cardHTML[CARD_FOR[c.dataset.k]];
  const key=c.dataset.cat || c.dataset.method;
  return key && typeof CAT_GUIDE!=='undefined' ? CAT_GUIDE[key] : null;
}
function showSheet(html){
  if(!html) return;
  clearTimeout(tipTimer);
  tip.innerHTML=html+'<button class="tipclose" type="button">close</button>';
  tip.classList.add('sheet');
  tip.style.display='block';
  tip.querySelector('.tipclose').addEventListener('click',e=>{e.stopPropagation();hideTip();});
  sheetOpen=true;
  setTimeout(()=>{sheetOpen=false;},0);   // let this click finish before outside-tap can close it
}
function bindMenuTips(){
  document.querySelectorAll('.mopt .minfo').forEach(b=>{
    if(b._wired) return; b._wired=true;
    b.addEventListener('click',e=>{ e.stopPropagation(); showSheet(tipFor(b.closest('.mopt'))); });
  });
  document.querySelectorAll('#pan-cat .mopt').forEach(o=>{
    const c=o._chip; if(!c) return;
    const key=c.dataset.cat || c.dataset.method;
    if(key && typeof CAT_GUIDE!=='undefined') bindTipHTML(o, CAT_GUIDE[key]);
  });
  ['pan-good','pan-limit'].forEach(p=>{
    document.querySelectorAll('#'+p+' .mopt').forEach(o=>{
      const k=o._chip && o._chip.dataset.k;
      if(k) bindTipHTML(o, cardHTML[CARD_FOR[k]]);
    });
  });
}
function syncMenus(){
  document.querySelectorAll('.menupanel .mopt').forEach(o=>{
    const c=o._chip; if(!c) return;
    const on = c.classList.contains('on') || (c.classList.contains('colchip') && !c.classList.contains('off'));
    o.classList.toggle('on', on && !c.classList.contains('partial'));
    o.classList.toggle('part', c.classList.contains('partial'));
  });
  const count=(sel,test)=>{
    const els=[...document.querySelectorAll(sel)].filter(x=>!(x.dataset.cat==='all'||x.classList.contains('colall')));
    return els.filter(test).length+'/'+els.length;
  };
  document.getElementById('cnt-cat').textContent =
    count('.controls .chip:not([data-method])', c=>c.classList.contains('on')||c.classList.contains('partial'));
  document.getElementById('cnt-good').textContent =
    count('#colgrid-good .colchip', c=>!c.classList.contains('off'));
  document.getElementById('cnt-limit').textContent =
    count('#colgrid-limit .colchip', c=>!c.classList.contains('off'));
}
// "Eat more" opens with EAT_MORE_LEAD in its fixed order, then the other columns you're
// showing, then the rest — those two groups A–Z, "all" still last. Sorted only as the
// menu opens, so ticking a box never moves it out from under the cursor.
function orderEatMore(pan){
  const label=o=>o._chip.textContent.trim();
  const az=(a,b)=>label(a).localeCompare(label(b),undefined,{numeric:true,sensitivity:'base'});
  const opts=[...pan.querySelectorAll('.mopt:not(.mall)')];
  const lead=EAT_MORE_LEAD.map(k=>opts.find(o=>o._chip.dataset.k===k)).filter(Boolean);
  const rest=opts.filter(o=>!lead.includes(o));
  const sep=pan.querySelector('.msep');
  [...lead,
   ...rest.filter(o=>o.classList.contains('on')).sort(az),
   ...rest.filter(o=>!o.classList.contains('on')).sort(az)].forEach(o=>pan.insertBefore(o,sep));
  pan.scrollTop=0;
}
document.querySelectorAll('.menu .menubtn').forEach(b=>{
  b.addEventListener('click',e=>{
    e.stopPropagation();
    const m=b.closest('.menu'), wasOpen=m.classList.contains('open');
    document.querySelectorAll('.menu').forEach(x=>x.classList.remove('open'));
    m.classList.toggle('open', !wasOpen);
    if(!wasOpen && m.id==='menu-good') orderEatMore(m.querySelector('.menupanel'));
  });
});
// close only on a genuine click outside any menu
document.addEventListener('click',e=>{
  if(menuForwarding) return;
  if(e.target.closest && e.target.closest('.menu')) return;
  document.querySelectorAll('.menu').forEach(m=>m.classList.remove('open'));
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape') document.querySelectorAll('.menu').forEach(m=>m.classList.remove('open'));
});
buildMenus(); syncMenus();

// ---- Nutrient guide on hover -------------------------------------------
// Reuses the guide cards themselves, so the tooltip can never drift out of sync.
const CARD_FOR={kcal:'Calories',dens:'Calories',fruct:'Fructose',trans:'Trans fat',
  satfat:'Saturated fat',omega6:'Omega-6',sodium:'Sodium',potk:'Potassium',aox:'Antioxidants',
  omega3:'Omega-3',gi:'Glycemic index',protein:'Protein',solfib:'Fibre (soluble)',insfib:'Fibre (insoluble)',chol:'Cholesterol (dietary)',
  purine:'Purines',phos:'Phosphorus & oxalate',calc:'Calcium',magn:'Magnesium',iron:'Iron',vitc:'Vitamin C',vitb12:'Vitamin B12',zinc:'Zinc',choline:'Choline',nitr:'Nitrate',vita:'Vitamin A',vitb6:'Vitamin B6',mang:'Manganese',merc:'Mercury',selen:'Selenium',iodine:'Iodine',vitd:'Vitamin D',vite:'Vitamin E',vitb1:'Vitamin B1',vitk:'Vitamin K1',folate:'Folate',
  mufa:'Monounsaturated fat (MUFA)',oxal:'Phosphorus & oxalate'};

const cardHTML={};
document.querySelectorAll('.ncard').forEach(c=>{
  const t=c.querySelector('h3');
  if(t) cardHTML[t.textContent.trim()]=c.innerHTML;
});

const tip=document.createElement('div');
tip.className='tip';
document.body.appendChild(tip);
let tipTimer=null, sheetOpen=false;

function showTipHTML(el,html){
  if(!html) return;
  tip.innerHTML=html;
  tip.style.display='block';
  const r=el.getBoundingClientRect(), tw=tip.offsetWidth, th=tip.offsetHeight;
  let x=r.left, y=r.bottom+8;
  if(x+tw>innerWidth-12) x=innerWidth-tw-12;
  if(x<12) x=12;
  if(y+th>innerHeight-12) y=Math.max(12, r.top-th-8);   // flip above when it would overflow
  tip.style.left=x+'px'; tip.style.top=y+'px';
}
function hideTip(){ clearTimeout(tipTimer); tip.style.display='none'; tip.classList.remove('sheet'); }
document.addEventListener('click',e=>{
  if(sheetOpen) return;
  if(tip.classList.contains('sheet') && !tip.contains(e.target)) hideTip();
});
function bindTipHTML(el,html){
  if(!el||!html) return;
  el.addEventListener('mouseenter',()=>{
    clearTimeout(tipTimer);
    tipTimer=setTimeout(()=>showTipHTML(el,html),2000);   // deliberate delay: sorting shouldn't summon it
  });
  el.addEventListener('mouseleave',hideTip);
  el.addEventListener('click',hideTip);
}
function bindTip(el,key){ bindTipHTML(el, cardHTML[CARD_FOR[key]]); }
document.querySelectorAll('th[data-k]').forEach(th=>bindTip(th,th.getAttribute('data-k')));
// touch has no hover: press and hold a header for ~450ms to read its guide
document.querySelectorAll('th[data-k]').forEach(th=>{
  const k=th.getAttribute('data-k');
  let lp=null, fired=false;
  th.addEventListener('touchstart',()=>{
    fired=false;
    lp=setTimeout(()=>{ fired=true; showSheet(cardHTML[CARD_FOR[k]]); },450);
  },{passive:true});
  const cancel=()=>clearTimeout(lp);
  th.addEventListener('touchend',cancel); th.addEventListener('touchmove',cancel);
  th.addEventListener('click',e=>{ if(fired){ e.preventDefault(); e.stopPropagation(); fired=false; } },true);
});

// ---- Category guide on hover -------------------------------------------
// What a diet built only on this group would be short of, and what closes the gap.
const mTip=(title,text)=>`<h3>${title}</h3><div class="line"><span class="txt">${text}</span></div>`;
const gTip=(title,provides,missing)=>`<h3>${title}</h3>`+
  `<div class="line"><span class="tag lo">Provides</span><span class="txt">${provides}</span></div>`+
  `<div class="line"><span class="tag hi">Missing</span><span class="txt">${missing}</span></div>`;

const CAT_GUIDE={
 carb: gTip('A diet of only carbs',
  'The cheapest and most reliable energy in the diet — starch that digests to glucose, the fuel every cell can burn. Whole versions (oats, brown rice, unripe plantain, yam) also bring fibre, magnesium and B vitamins.',
  'Protein is low and <b>incomplete</b> — grains are short on the amino acid lysine. Almost no vitamin B12, vitamin C, vitamin A, omega-3 or absorbable iron. Refined versions (white rice, semovita, fufu, garri) also strip out most of the fibre, magnesium and B vitamins the whole grain started with.'),

 veg: gTip('A diet of only vegetables',
  'The densest nutrition per calorie in the table: vitamin C, vitamin K1, folate, potassium, antioxidants and fibre, for almost no energy cost. Leafy greens in particular carry calcium, iron and magnesium too.',
  'Calories and protein above all — you physically cannot eat enough vegetables to meet energy needs. No vitamin B12, almost no fat, and the calcium and iron that are present absorb poorly because oxalates and phytates bind them.'),

 protein: gTip('A diet of only protein',
  'Complete protein for muscle, repair and immunity — the most satiating macro per calorie, with the highest thermic effect. Animal sources add B12, heme iron and zinc; fish adds omega-3.',
  '<b>Fibre — zero</b> from animal sources, so gut transit and gut bacteria both suffer. Near-zero vitamin C and antioxidants, and little carbohydrate, so protein gets burned for energy instead of doing its job.'),

 legume: gTip('A diet of only legumes',
  'Protein and fibre in the same food, which almost nothing else here manages. Also the table&rsquo;s best folate, plus iron, magnesium, potassium and a low glycemic index.',
  '<b>Vitamin B12 entirely</b> — no plant food contains it. Low in methionine (the amino acid grains are rich in), no heme iron, little vitamin A, and negligible omega-3.'),

 fruit: gTip('A diet of only fruit',
  'Vitamin C, potassium, antioxidants and soluble fibre, in a package that is mostly water — so high nutrition at low calorie density. The fibre and water also pace the fructose, which juice does not.',
  'Protein, fat, B12, calcium, zinc, omega-3 — and calories, since most fruit is largely water. It is short in every direction except vitamin C, potassium and antioxidants.'),

 grain: gTip('A diet of only grains',
  'Steady, cheap energy from starch, plus — in the whole versions (oats, brown rice, whole wheat bread) — fibre, magnesium, manganese and B vitamins. Oats stand out for soluble fibre.',
  'Protein is modest and <b>incomplete</b> — grains are short on lysine, which beans supply. No vitamin B12, vitamin C or vitamin A, little calcium, and iron that absorbs poorly. Refined versions (white rice, white bread, pasta, noodles) lose most of the fibre and minerals; instant noodles add a heavy dose of sodium.'),

 swallow: gTip('A diet of only swallows',
  'Energy, cheaply and in volume — the practical base a Nigerian meal is built around, and what makes a bowl of soup into a full meal.',
  '<b>Almost everything.</b> Eba, fufu, amala, semovita and pounded yam are close to pure starch — very little protein, fat, vitamin or mineral content of any kind.'),

 milk: gTip('A diet of only milk &amp; yoghurt',
  'The most absorbable calcium in the table, plus complete protein, vitamin B12, iodine, potassium and — in the powders — real density. Plain yoghurt adds live cultures for the gut, and the strained Greek versions roughly double the protein while cutting the lactose.',
  'Fibre entirely, iron (dairy is famously poor in it, and its calcium actively blocks iron absorption from other foods eaten at the same time), vitamin C, and vitamin D unless the product is fortified. Sweetened versions also carry ~9&nbsp;g of added sugar per 100&nbsp;g, which is where the fructose column lights up.'),
 nut: gTip('A diet of only nuts &amp; seeds',
  'The best plant fats here: MUFA, vitamin E, magnesium, and in walnuts and chia, real omega-3. Also protein, fibre and iron in a genuinely satiating form.',
  'Vitamin C, vitamin A and B12. Most nuts are also heavily skewed toward omega-6 with little omega-3 to balance it — walnuts and chia are the exceptions.'),

 oil: gTip('A diet of only oils &amp; fats',
  'Concentrated energy, vitamin E, and the fat that makes vitamins A, D, E and K1 absorbable from everything else on the plate. Olive, canola and avocado add MUFA.',
  'Everything except energy, vitamin E and a little K1. No protein, no fibre, no minerals — and <b>no satiety signal at all</b>, which is why oil is the easiest thing in any kitchen to over-consume without noticing.'),

 sweet: gTip('A diet of only sweeteners',
  'Sweetness, and in the caloric ones, energy. Blackstrap molasses is the lone entry with real minerals; the non-caloric ones provide sweetness with no energy at all.',
  '<b>Everything.</b> Sweeteners deliver either sugar or nothing at all — no protein, fat, fibre, vitamin or mineral worth counting. Blackstrap molasses is the single exception, and it is still 60% sugar.'),

 animal: gTip('A diet of only animal protein',
  'The most complete protein available, plus vitamin B12, heme iron and zinc — the nutrients plants either lack or deliver poorly. Offal adds extreme vitamin A and B-vitamin density.',
  '<b>Fibre — zero, in every animal food.</b> Near-zero vitamin C, folate (liver excepted) and antioxidants. No carbohydrate for energy.'),

 fish: gTip('A diet of only fish &amp; seafood',
  'Complete, lean protein with the table&rsquo;s best omega-3 — oily fish like Titus, sardines, herring, bonga and salmon above all — plus vitamin D, B12, selenium and iodine. Small fish eaten bones and all (sardines, bonga) add real calcium.',
  'Fibre, vitamin C and carbohydrate, as with all animal food. Dried and smoked fish (stockfish, dried kpanla, bonga) also carry a lot of <b>salt</b>. Snail sits in this group too, alongside the shellfish.'),

 plant: gTip('A diet of only plant protein',
  'Protein without cholesterol or saturated fat, alongside magnesium, iron and fibre. Egusi and ogbono also bring substantial energy and fat.',
  'Vitamin B12 and heme iron. This is also a small group here — quinoa, egusi and ogbono — so it lacks the variety to carry a diet on its own.'),

 all: gTip('Every category',
  'Every nutrient this table tracks, from every direction — energy, complete protein, all the fats, fibre in both forms, and the full mineral and vitamin range.',
  'Nothing structural — with all groups showing, the table can cover every nutrient it tracks.'),

 'cooked-meat': mTip('Cooked meat',
  'Meat, poultry and eggs boiled, stewed or roasted with no oil and no salt — the table&rsquo;s baseline figures.'),
 'air-fried-meat': mTip('Air-fried meat',
  'Worked out from the cooked figures: about 5% more of everything per 100g from extra moisture loss, and <b>no added oil</b> — so nutritionally almost the same as cooked.'),
 'oil-fried-meat': mTip('Oil-fried meat',
  'Worked out from the cooked figures plus about <b>5g of palm olein soaked up per 100g</b> — roughly 50 extra kcal and about 2g more saturated fat. No salt, batter or reused oil assumed.'),
 'cooked-fish': mTip('Cooked fish',
  'Fish, shellfish and snail boiled, stewed or roasted with no oil and no salt — the table&rsquo;s baseline figures.'),
 'air-fried-fish': mTip('Air-fried fish',
  'Worked out from the cooked figures: about 5% more of everything per 100g from extra moisture loss, and <b>no added oil</b> — so nutritionally almost the same as cooked.'),
 'oil-fried-fish': mTip('Oil-fried fish',
  'Worked out from the cooked figures plus about <b>7g of palm olein soaked up per 100g</b> — fish takes up more than meat — roughly 65 extra kcal and about 3g more saturated fat. No salt, batter or reused oil assumed.')
};

document.querySelectorAll('.chip[data-cat]').forEach(c=>bindTipHTML(c, CAT_GUIDE[c.dataset.cat]));
document.querySelectorAll('.chip[data-method]').forEach(c=>bindTipHTML(c, CAT_GUIDE[c.dataset.method]));
if(typeof bindMenuTips==='function') bindMenuTips();
document.querySelectorAll('.colchip[data-k]').forEach(ch=>bindTip(ch,ch.dataset.k));
window.addEventListener('scroll',hideTip,{passive:true});

function cellCls(nutrient, v){
  if(v==null) return `c-${nutrient}`;
  return `c-${nutrient}${v>=HI[nutrient]?' high':''}`;
}

function fatTag(d){
  return d.fat?`<span class="fat fat-${d.fat}" title="Fat per 100g/ml as listed: low = 1.5g or less, medium = 1.5–3g, high = 3g or more">${d.fat} fat</span>`:'';
}
// The food table (and My List, which shows the same foods) leads with EAT_MORE_LEAD,
// straight after the food name; the seasonings table keeps the page's order.
['tbl','mylist-tbl'].forEach(id=>{
  const nameTh=document.querySelector(`#${id} thead th[data-k="name"]`);
  [...EAT_MORE_LEAD].reverse().forEach(k=>nameTh.after(nameTh.parentNode.querySelector(`th[data-k="${k}"]`)));
});
// cells are laid out from each table's own header row, so they can't drift from their headings
const headKeys=id=>[...document.querySelectorAll(`#${id} thead th`)].map(th=>th.dataset.k).filter(k=>k!=="name");
const FOOD_KEYS=headKeys('tbl'), SPICE_KEYS=headKeys('spice-tbl');
function nutCell(d,k){
  return `<td class="${cellCls(k,d[k])}">${d[k]!=null?d[k]:'–'}</td>`;
}
function nutCells(d,keys){
  return keys.map(k=>nutCell(d,k)).join("");
}
function buildRow(d,keys=FOOD_KEYS){
  const starred=favorites.has(d.name);
  const safeName=d.name.replace(/'/g,"\\'");
  const star=`<span class="star ${starred?'on':''}" onclick="toggleFav('${safeName}')">${starred?'★':'☆'}</span>`;
  return `<tr>
    <td>${star}${d.name}<span class="cat">${d.cat}</span>${fatTag(d)}</td>${nutCells(d,keys)}
  </tr>`;
}
// Milk columns, left to right. "FAT" and "REST" stand for groups: FAT is the fat figures
// behind each pack's low/medium/high level, REST is every other column. Inside those two
// groups columns run from the value most packs list to the one fewest list, so the figures
// you can actually compare sit on the left; a fat column no pack lists joins REST.
const MILK_ORDER=["calc","fat","sodium","FAT","carb","sugar","size","kcal","REST","trans"];
const MILK_FAT=["totfat","satfat","mufa"];
const milkData=data.filter(d=>d.cat==="milk");
const milkHead=document.querySelector("#milk-tbl thead tr");
const filled=k=>milkData.filter(d=>d[k]!=null).length;
const milkGroup=k=>MILK_ORDER.includes(k)?MILK_ORDER.indexOf(k)
  :MILK_ORDER.indexOf(MILK_FAT.includes(k)&&filled(k)>0?"FAT":"REST");
const milkKeys=[...milkHead.querySelectorAll("th")].map(th=>th.dataset.k)
  .filter(k=>k!=="name")
  .sort((a,b)=>milkGroup(a)-milkGroup(b)||filled(b)-filled(a));   // stable: ties keep the page's order
milkKeys.forEach(k=>milkHead.appendChild(milkHead.querySelector(`th[data-k="${k}"]`)));
// EU food-label daily reference intakes for an adult. Milk cells show the amount per
// serving with its share of this underneath; columns with no official RI show the amount only.
const RI={kcal:2000,protein:50,totfat:70,satfat:20,carb:260,sugar:90,sodium:2400,potk:2000,calc:800,phos:700,magn:375,iron:14,
  zinc:10,mang:2,selen:55,iodine:150,vita:800,vitd:5,vite:12,vitk:75,vitc:80,vitb1:1.1,vitb6:1.4,
  folate:200,vitb12:2.5};
// every heading with a daily figure shows it, in the column's own unit — "Calcium mg (RI 800)"
document.querySelectorAll('thead th[data-k]').forEach(th=>{
  const ri=RI[th.dataset.k];
  if(ri==null) return;
  const tag=`<span class="rih">(RI ${ri.toLocaleString('en')})</span> `;
  const arrow=th.querySelector('.arrow');
  if(arrow) arrow.insertAdjacentHTML('beforebegin',tag); else th.insertAdjacentHTML('beforeend',' '+tag);
});
function milkCell(d,k){
  const v=d[k];
  if(v==null || !RI[k]) return nutCell(d,k);
  const below=typeof v==='string';                   // a "<0.5"-style label figure
  const pct=(below?parseFloat(v.slice(1)):v)/RI[k]*100;
  const shown=below?'<'+Math.max(1,Math.round(pct)):(pct>0&&pct<1?'<1':Math.round(pct));
  // 20% of a day's intake from one serving is a lot — bold it, as "high" does elsewhere
  return `<td class="c-${k}${pct>=20?' high':''}">${v}<span class="ri" title="share of an adult's daily reference intake (RI)">${shown}% RI</span></td>`;
}
function buildMilkRow(d){
  return `<tr>
    <td>${d.name}<span class="cat">${d.form}</span></td>${milkKeys.map(k=>k==="size"
      ? `<td class="c-size">${d.serving} · ${d.size}${d.unit}</td>`
      : k==="fat" ? `<td class="c-fat">${fatTag(d)||'–'}</td>`
      : milkCell(d,k)).join("")}
  </tr>`;
}

const FAT_RANK={low:1,medium:2,high:3};
function sortRows(rows, sK, sD){
  return rows.sort((a,b)=>{
    if(sK==="name") return a.name.localeCompare(b.name)*sD;
    // fat levels sort low → medium → high; a "<0.5" label figure sorts as 0.5
    const num=v=>v==null?-1:FAT_RANK[v]||(typeof v==='string'?parseFloat(v.replace('<','')):v);
    const av=num(a[sK]), bv=num(b[sK]);
    return (av-bv)*sD;
  });
}

// Chips that stand for a group rather than a single category.
// "animal protein" includes fish — fish are animals; "fish & seafood" narrows to just them.
// Each chip covers one or more leaf categories. Chips are exclusion toggles:
// everything is shown by default and clicking a chip hides that category.
// Umbrella chips overlap on purpose — "protein" covers what "animal" and "plant" cover.
const CHIP_CATS={
  fruit:["fruit"], veg:["veg"], carb:["grain","starch","swallow"], grain:["grain"],
  protein:["animal","fish","plant","legume"], animal:["animal","fish"], plant:["plant"],
  legume:["legume"], nut:["nut"], swallow:["swallow"], oil:["oil"], sweet:["sweet"]
};
// search text: the name plus the visible tags (category, milk form, fat level)
function hay(d){ return (d.name+' '+d.cat+(d.form?' '+d.form:'')+(d.fat?' '+d.fat+' fat':'')).toLowerCase(); }
function matchesFiltersBase(d){
  if(d.method && hiddenMethods.has(d.method)) return false;
  if(hiddenCats.has(d.cat)) return false;
  return hay(d).includes(q);
}

function matchesFiltersMain(d){
  if(d.cat==="spice"||d.cat==="milk") return false;
  return matchesFiltersBase(d);
}

function matchesFiltersSpice(d){
  if(d.cat!=="spice") return false;
  return hay(d).includes(q);
}

function render(){
  // My list — starred + same category & search filter as main, but never spice items
  let myRows=data.filter(d=>favorites.has(d.name)&&matchesFiltersMain(d));
  // Always include starred spices when the search matches (chip doesn't gate them — they live below)
  let myRowsSpice=data.filter(d=>favorites.has(d.name)&&matchesFiltersSpice(d));
  let myAll=[...myRows,...myRowsSpice];
  sortRows(myAll,sortK.my,sortDir.my);
  if(myAll.length===0){
    if(favorites.size===0){
      mylistBody.innerHTML=`<tr><td colspan="40" class="mylist-empty">Tap the <b>☆</b> next to any food below to build your personal list. Starred foods appear here with the same columns and sorting as the main table.</td></tr>`;
    } else {
      mylistBody.innerHTML=`<tr><td colspan="40" class="mylist-empty">No starred foods match the current filter. Switch to <b>all</b> or clear the search to see your other starred foods.</td></tr>`;
    }
  } else {
    mylistBody.innerHTML=myAll.map(d=>buildRow(d)).join("");
  }
  mylistCount.textContent=myAll.length+" starred";
  mylistHint.textContent="("+myAll.length+")";

  // Main list — apply category & search filters, excluding spices
  let rows=data.filter(matchesFiltersMain);
  sortRows(rows,sortK.main,sortDir.main);
  body.innerHTML=rows.map(d=>buildRow(d)).join("");

  // Spice list — independent of category chip, only filtered by search
  let spiceRows=data.filter(matchesFiltersSpice);
  sortRows(spiceRows,sortK.spice,sortDir.spice);
  spiceBody.innerHTML=spiceRows.map(d=>buildRow(d,SPICE_KEYS)).join("");
  spiceCount.textContent=spiceRows.length+" items";

  // Milk & yoghurt — its own table, filtered only by search
  let milkRows=data.filter(d=>d.cat==="milk"&&hay(d).includes(q));
  sortRows(milkRows,sortK.milk,sortDir.milk);
  milkBody.innerHTML=milkRows.map(buildMilkRow).join("");
  milkCount.textContent=milkRows.length+" items";
}

function bindHeaders(tableId, which){
  document.querySelectorAll(`#${tableId} th`).forEach(th=>{
    th.onclick=()=>{
      const k=th.dataset.k;
      if(!k) return;
      if(sortK[which]===k) sortDir[which]*=-1;
      else {sortK[which]=k; sortDir[which]=(k==="name")?1:-1;}
      document.querySelectorAll(`#${tableId} th`).forEach(t=>{
        t.classList.remove("active");
        const a=t.querySelector(".arrow");
        if(a) a.textContent="";
      });
      th.classList.add("active");
      const a=th.querySelector(".arrow");
      if(a) a.textContent=sortDir[which]<0?"▼":"▲";
      render();
    };
  });
}
bindHeaders("tbl","main");
bindHeaders("mylist-tbl","my");
bindHeaders("spice-tbl","spice");
bindHeaders("milk-tbl","milk");

const chipEls=[...document.querySelectorAll(".chip[data-cat]")];
const methodEls=[...document.querySelectorAll(".chip[data-method]")];
// every leaf category in the data (the seasonings table is filtered separately)
const ALL_CATS=[...new Set(data.map(d=>d.cat))].filter(c=>c!=="spice"&&c!=="milk");
const leavesOf=k=>k==="all"?ALL_CATS:(CHIP_CATS[k]||[k]);
function syncChips(){
  chipEls.forEach(c=>{
    const k=c.dataset.cat;
    if(k==="all"){
      c.classList.toggle("on", hiddenCats.size===0 && hiddenMethods.size===0);
      c.classList.remove("partial");
      return;
    }
    const leaves=leavesOf(k);
    const hidden=leaves.filter(l=>hiddenCats.has(l)).length;
    c.classList.toggle("on", hidden===0);
    // an umbrella chip can be half-hidden — e.g. "protein" once "plant" alone is off
    c.classList.toggle("partial", hidden>0 && hidden<leaves.length);
  });
  methodEls.forEach(c=>c.classList.toggle("on", !hiddenMethods.has(c.dataset.method)));
  if(typeof syncMenus==='function') syncMenus();
}
chipEls.forEach(c=>{
  c.onclick=()=>{
    const leaves=leavesOf(c.dataset.cat);
    // "all" counts the cooking filter too: everything showing hides every category,
    // anything hidden brings back every category and every cooking method
    const allShown=leaves.every(l=>!hiddenCats.has(l)) && (c.dataset.cat!=="all" || hiddenMethods.size===0);
    if(allShown) leaves.forEach(l=>hiddenCats.add(l));
    else{
      leaves.forEach(l=>hiddenCats.delete(l));
      if(c.dataset.cat==="all"){ hiddenMethods.clear(); saveMethods(); }
    }
    try{ localStorage.setItem(CATS_KEY,JSON.stringify([...hiddenCats])); }catch(e){}
    syncChips(); render();
  };
});
// cooking options are exclusion toggles too
methodEls.forEach(c=>{
  c.onclick=()=>{
    const m=c.dataset.method;
    if(hiddenMethods.has(m)) hiddenMethods.delete(m); else hiddenMethods.add(m);
    saveMethods(); syncChips(); render();
  };
});
syncChips();

document.getElementById("search").oninput=e=>{q=e.target.value.toLowerCase();render();};
render();

syncMenus();   // final pass: every chip has its initial state by now
}