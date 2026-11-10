// Elements and saved decisions
const $ = (s) => document.querySelector(s),
  cards = [...document.querySelectorAll(".card")],
  live = cards.filter((c) => c.dataset.img),
  byId = new Map(cards.map((c) => [c.dataset.id, c]));
const KEY = "wpe-gallery-v1",
  calm = matchMedia("(prefers-reduced-motion:reduce)").matches;
const loadSaved = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch (e) {
    return {};
  }
};
const saved = loadSaved();
const isLive = (i) => byId.has(i) && !!byId.get(i).dataset.img;
const has = (a) => new Set((Array.isArray(a) ? a : []).filter(isLive));
const kept = has(saved.kept),
  skipped = has(saved.skipped),
  sent = has(saved.sent);
let deck = [],
  pos = 0,
  hist = (saved.hist || []).filter((h) => isLive(h.id)),
  roundHome = "atlas",
  lastKept = "",
  ambOn = 0;
const persist = () => {
  // Every gallery opened from disk shares this storage, so keep the IDs of other galleries.
  const old = loadSaved(),
    merged = (name, ids) => [...(old[name] || []).filter((i) => !byId.has(i)), ...ids];
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        kept: merged("kept", kept),
        skipped: merged("skipped", skipped),
        sent: merged("sent", sent),
        hist: [
          ...(old.hist || []).filter((h) => !byId.has(h.id)).slice(-200),
          ...hist.slice(-50).map((h) => ({ id: h.id, was: h.was })),
        ],
      }),
    );
  } catch (e) {}
};

// Formatting and lookup helpers
const size = (n) => (n >= 1e9 ? (n / 1e9).toFixed(1) + " GB" : Math.round(n / 1e6) + " MB");
const short = (n) =>
  n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? Math.round(n / 1e3) + "K" : String(n);
const bytes = (ids) => [...ids].reduce((t, i) => t + +byId.get(i).dataset.size, 0);
const undecided = (c) => !kept.has(c.dataset.id) && !skipped.has(c.dataset.id);
const url = (c) => c.querySelector("a").href;
const thumb = (c) => (atlasCache[c.dataset.id] || {}).t || c.dataset.img;
const isSensitive = (c) => !!c && !!c.dataset.sensitive;
let toastTimer = 0;
function toast(message) {
  const t = $("#toast");
  t.textContent = message;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 3500);
}
function download(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// View switching and shared painting
const HEADINGS = { stage: "#title", wall: "#wc", done: "#doneH", atlas: "#atlasH" };
let wallY = 0;
function view(v) {
  if (document.body.dataset.view == "wall") wallY = scrollY;
  for (const s of ["stage", "wall", "done", "atlas"]) $("#" + s).hidden = s != v;
  document.body.dataset.view = v;
  placeFilters(v);
  if (v == "done") paintDone();
  if (v == "atlas") openAtlas();
  else leaveAtlas();
  scrollTo(0, v == "wall" ? wallY : 0);
  // Move focus with the screen so keyboard and screen reader users are not left behind.
  $(HEADINGS[v]).focus({ preventScroll: true });
}
function verdict(id) {
  return kept.has(id) ? "k" : skipped.has(id) ? "s" : "";
}
function mark(id, v) {
  kept.delete(id);
  skipped.delete(id);
  if (v == "k") {
    kept.add(id);
    lastKept = id;
  }
  if (v == "s") skipped.add(id);
  if (v != "k") sent.delete(id);
}
function visible() {
  return live.filter((c) => c.style.display != "none");
}
function paint() {
  const made = kept.size + skipped.size;
  $("#bar").style.width = (live.length ? (made / live.length) * 100 : 0) + "%";
  $("#count").innerHTML = "<b>" + made + "</b> / " + live.length + " đã duyệt";
  $("#shelf").replaceChildren(...[...kept].slice(-40).map(shelfImage));
  lastKept = "";
  $("#total").innerHTML = kept.size
    ? "<b>" + kept.size + " đã giữ</b><span> · " + size(bytes(kept)) + "</span>"
    : "";
  for (const c of live) {
    const i = c.dataset.id;
    c.classList.toggle("kept", kept.has(i));
    c.classList.toggle("skipped", skipped.has(i));
    c.querySelector(".pin").setAttribute("aria-pressed", kept.has(i));
  }
  $("#wc").textContent = live.length + " wallpaper · " + kept.size + " đã giữ";
  const n = visible().filter(undecided).length;
  $("#sort").textContent = n ? "Duyệt " + n + " →" : "Đã duyệt hết";
  $("#sort").disabled = !n;
  $("#undo").disabled = !hist.length;
  paintAtlas();
  persist();
}
// Reusing the same elements keeps the shelf from reloading its images after every decision.
const shelfImages = new Map();
function shelfImage(i) {
  let m = shelfImages.get(i);
  if (!m) {
    m = new Image();
    m.alt = "";
    m.src = thumb(byId.get(i));
    shelfImages.set(i, m);
  }
  m.className = (i == lastKept ? "new " : "") + (isSensitive(byId.get(i)) ? "sensitive" : "");
  return m;
}

// Sorting deck
function current() {
  return deck[pos];
}
function endRound() {
  const left = live.filter(undecided).length;
  if (!left) {
    view("done");
    return;
  }
  view(roundHome);
  toast("Xong vòng này. Còn " + left + " wallpaper chưa duyệt.");
}
function showCard(enter) {
  const c = current();
  if (!c) {
    endRound();
    return;
  }
  const d = c.dataset,
    hero = $("#hero"),
    next = [deck[pos + 1], deck[pos + 2]];
  hero.src = d.img;
  hero.alt = d.title;
  hero.classList.toggle("sensitive", isSensitive(c));
  $("#p1").classList.toggle("sensitive", isSensitive(next[0]));
  $("#p2").classList.toggle("sensitive", isSensitive(next[1]));
  $("#reveal").hidden = !isSensitive(c);
  $("#p1").hidden = !next[0];
  if (next[0]) $("#p1").src = next[0].dataset.img;
  $("#p2").hidden = !next[1];
  if (next[1]) $("#p2").src = next[1].dataset.img;
  if (deck[pos + 3]) new Image().src = deck[pos + 3].dataset.img;
  const a = $("#a" + (1 - ambOn)),
    b = $("#a" + ambOn);
  a.src = d.img;
  a.classList.add("on");
  b.classList.remove("on");
  ambOn = 1 - ambOn;
  $("#title").textContent = d.title;
  $("#num").textContent = "#" + d.n + " · còn " + (deck.length - pos) + " wallpaper trong vòng này";
  $("#meta").textContent = [
    d.kind,
    d.res,
    +d.size ? size(+d.size) : "",
    +d.subs ? short(+d.subs) + " người đăng ký" : "",
  ]
    .filter(Boolean)
    .join(" · ");
  $("#tags").replaceChildren(
    ...(d.tags ? d.tags.split("|") : []).slice(0, 5).map((t) => {
      const l = document.createElement("li");
      l.textContent = t;
      return l;
    }),
  );
  $("#steam").href = url(c);
  if (enter && !calm)
    hero.animate(
      [
        { transform: "translateX(6.5%) scale(.92)", filter: "brightness(.58)" },
        { transform: "none", filter: "none" },
      ],
      { duration: 240, easing: "cubic-bezier(.2,.8,.3,1)" },
    );
}
function fly(v, from) {
  if (calm) return;
  const hero = $("#hero"),
    r = hero.getBoundingClientRect(),
    f = hero.cloneNode();
  f.removeAttribute("id");
  f.className = "flyer" + (hero.classList.contains("sensitive") ? " sensitive" : "");
  f.style.cssText =
    "left:" + r.left + "px;top:" + r.top + "px;width:" + r.width + "px;height:" + r.height + "px";
  document.body.append(f);
  let end = "translateX(-120vw) rotate(-16deg)";
  if (v == "k") {
    const s = $("#shelf").getBoundingClientRect(),
      dx = s.right - 27 - (r.left + r.width / 2),
      dy = s.top + 29 - (r.top + r.height / 2);
    end = "translate(" + dx + "px," + dy + "px) scale(" + 54 / r.width + ")";
  }
  f.animate(
    [
      { transform: from || "none", opacity: 1 },
      { transform: end, opacity: v == "k" ? 0.9 : 0 },
    ],
    { duration: v == "k" ? 420 : 300, easing: "cubic-bezier(.45,.05,.3,1)" },
  ).onfinish = () => f.remove();
}
function decide(v, from) {
  const c = current();
  if (!c) return;
  const id = c.dataset.id;
  fly(v, from);
  hist.push({ id, was: verdict(id), deck, pos });
  mark(id, v);
  pos++;
  paint();
  showCard(true);
}
function undo() {
  const h = hist.pop();
  if (!h) return;
  mark(h.id, h.was);
  if (h.deck) {
    deck = h.deck;
    pos = h.pos;
  } else {
    // Undo history restored after a reload has no round to return to, so build one.
    const c = byId.get(h.id);
    deck = [c, ...live.filter((o) => o != c && undecided(o))];
    pos = 0;
  }
  paint();
  view("stage");
  showCard(false);
}
function start(list) {
  const from = document.body.dataset.view;
  if (from == "atlas" || from == "wall") roundHome = from;
  deck = list;
  pos = 0;
  if (list.length) {
    view("stage");
    showCard(false);
  } else view("done");
  paint();
}

// Finish view
function paintDone() {
  const list = [...kept],
    left = live.filter(undecided).length;
  $("#doneH").textContent = list.length ? "Giữ " + list.length + " wallpaper" : "Chưa giữ ảnh nào";
  $("#doneP").textContent =
    (list.length
      ? "Cần tải " +
        size(bytes(kept)) +
        ", trong tổng số " +
        size(bytes(live.map((c) => c.dataset.id))) +
        ". "
      : "") +
    "Đã bỏ qua " +
    skipped.size +
    (left ? ", còn " + left + " chưa duyệt." : ".");
  const n = list.filter((i) => !sent.has(i)).length,
    b = $("#next");
  b.disabled = !n;
  b.innerHTML = list.length
    ? n
      ? "Mở tiếp trên Steam (" + (list.length - n + 1) + " / " + list.length + ")<kbd>N</kbd>"
      : "Đã mở hết trên Steam"
    : "Mở tiếp trên Steam";
  $("#save").disabled = !list.length;
  fitMosaic(list.length);
  $("#mosaic").replaceChildren(
    ...list.map((i) => {
      const c = byId.get(i),
        a = document.createElement("a"),
        m = new Image();
      a.href = url(c);
      a.target = "_blank";
      a.rel = "noopener";
      a.title = c.dataset.title;
      a.dataset.id = i;
      m.loading = "lazy";
      m.decoding = "async";
      m.src = c.dataset.img;
      m.alt = c.dataset.title;
      if (isSensitive(c)) m.className = "sensitive";
      if (sent.has(i)) a.className = "sent";
      a.append(m);
      return a;
    }),
  );
}
function openNext() {
  const i = [...kept].find((x) => !sent.has(x));
  if (!i) return;
  window.open(url(byId.get(i)), "_blank", "noopener");
  sent.add(i);
  persist();
  paintDone();
}
// Grow the tiles when only a few wallpapers are kept, so the screen does not look empty.
function fitMosaic(n) {
  const m = $("#mosaic"),
    W = m.clientWidth - 8,
    H = innerHeight;
  if (!n || W <= 0) return;
  const columns = Math.max(1, Math.min(Math.floor(W / 170), Math.ceil(Math.sqrt((n * W) / H)))),
    rows = Math.ceil(n / columns),
    byWidth = Math.min(460, Math.floor((W - (columns - 1) * 4) / columns)),
    byHeight = Math.floor((H - 8 - (rows - 1) * 4) / rows);
  // Fit on one screen when that keeps tiles a useful size. Otherwise fill the width and scroll.
  const side = byHeight >= 170 ? Math.min(byWidth, byHeight) : byWidth;
  m.style.setProperty("--mosaic", "repeat(" + columns + "," + side + "px)");
}
function saveLinks() {
  download("wpe-kept.txt", [...kept].map((i) => url(byId.get(i))).join("\n") + "\n", "text/plain");
}
function exportProgress() {
  const state = { kept: [...kept], skipped: [...skipped], sent: [...sent] };
  download("wpe-progress.json", JSON.stringify(state, null, 2) + "\n", "application/json");
}
async function importProgress(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch (e) {
    toast("Không đọc được file tiến độ này.");
    return;
  }
  const newKept = has(data && data.kept),
    newSkipped = has(data && data.skipped),
    newSent = has(data && data.sent);
  if (!newKept.size && !newSkipped.size) {
    toast("File không có lựa chọn nào thuộc gallery này.");
    return;
  }
  for (const i of newSkipped) mark(i, "s");
  for (const i of newKept) mark(i, "k");
  for (const i of newSent) if (kept.has(i)) sent.add(i);
  lastKept = "";
  paint();
  paintDone();
  toast("Đã nạp " + (newKept.size + newSkipped.size) + " lựa chọn.");
}

// Color atlas: every wallpaper on one screen, hue left to right and lightness top to bottom
const ATLAS_KEY = "wpe-gallery-atlas-v1",
  ATLAS_MAX_CHARS = 3e6,
  THUMB = 96,
  GAP = 2,
  MAX_TILE = 180,
  REVEAL_DELAY = 500,
  NEUTRAL = 0.07,
  field = $("#field"),
  colors = new Map(),
  placed = new Map(),
  picked = new Set();
let atlasCache = {},
  tiles = [],
  spectrumReady = false,
  arranged = false,
  revealTimer = 0,
  colorsRead = 0,
  grid = null,
  brush = null,
  settleTimer = 0;
try {
  atlasCache = JSON.parse(localStorage.getItem(ATLAS_KEY)) || {};
} catch (e) {}
const cardOf = (t) => byId.get(t.dataset.id);
function saveAtlas() {
  const mine = {};
  for (const t of tiles)
    if (atlasCache[t.dataset.id]) mine[t.dataset.id] = atlasCache[t.dataset.id];
  try {
    const old = JSON.parse(localStorage.getItem(ATLAS_KEY)) || {},
      all = JSON.stringify({ ...old, ...mine });
    // Thumbnails must never crowd out the Keep and Skip decisions in the same storage.
    localStorage.setItem(ATLAS_KEY, all.length < ATLAS_MAX_CHARS ? all : JSON.stringify(mine));
  } catch (e) {}
}
function dominantColor(px) {
  const bins = new Float64Array(36);
  let chroma = 0,
    light = 0,
    count = px.length / 4;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i] / 255,
      g = px[i + 1] / 255,
      b = px[i + 2] / 255,
      max = Math.max(r, g, b),
      min = Math.min(r, g, b),
      c = max - min;
    chroma += c;
    light += (max + min) / 2;
    if (c < 0.1) continue;
    const h = max == r ? ((g - b) / c + 6) % 6 : max == g ? (b - r) / c + 2 : (r - g) / c + 4;
    bins[Math.min(35, Math.floor(h * 6))] += c;
  }
  let best = 0,
    score = -1;
  for (let i = 0; i < 36; i++) {
    const s = bins[(i + 35) % 36] + bins[i] * 2 + bins[(i + 1) % 36];
    if (s > score) {
      score = s;
      best = i;
    }
  }
  return [best * 10 + 5, +(chroma / count).toFixed(3), +(light / count).toFixed(3)];
}
function showTile(t, entry) {
  colors.set(t.dataset.id, entry.c);
  t.firstChild.src = entry.t;
  t.classList.add("ready");
}
function readTile(t, ctx, canvas) {
  return new Promise((done) => {
    const m = new Image(),
      full = cardOf(t).dataset.img;
    m.crossOrigin = "anonymous";
    m.onerror = () => {
      t.firstChild.src = full;
      t.classList.add("ready");
      done();
    };
    m.onload = () => {
      try {
        ctx.drawImage(m, 0, 0, THUMB, THUMB);
        const entry = {
          c: dominantColor(ctx.getImageData(0, 0, THUMB, THUMB).data),
          t: canvas.toDataURL("image/jpeg", 0.62),
        };
        atlasCache[t.dataset.id] = entry;
        showTile(t, entry);
      } catch (e) {
        t.firstChild.src = full;
        t.classList.add("ready");
      }
      done();
    };
    m.src = full;
  });
}
async function readColors(queue) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = THUMB;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  let next = 0;
  const worker = async () => {
    while (next < queue.length) {
      await readTile(queue[next++], ctx, canvas);
      colorsRead++;
      paintAtlas();
      if (colorsRead % 25 == 0) saveAtlas();
    }
  };
  await Promise.all(Array.from({ length: 10 }, worker));
  saveAtlas();
  spectrumReady = true;
  paintAtlas();
  revealSpectrum();
}
// Tiles start in list order and fly into the spectrum once per page load, cached or not.
function revealSpectrum() {
  if (arranged || !spectrumReady || document.body.dataset.view != "atlas") return;
  clearTimeout(revealTimer);
  revealTimer = setTimeout(
    () => {
      if (document.body.dataset.view != "atlas") return;
      arranged = true;
      layoutAtlas(!calm);
    },
    calm ? 0 : REVEAL_DELAY,
  );
}
function buildAtlas() {
  if (tiles.length) return;
  tiles = live.map((c, i) => {
    const t = document.createElement("button"),
      m = new Image();
    t.type = "button";
    t.className = "tile";
    t.tabIndex = i ? -1 : 0;
    t.dataset.id = c.dataset.id;
    t.setAttribute("aria-label", c.dataset.title);
    t.classList.toggle("sensitive", isSensitive(c));
    m.alt = "";
    m.draggable = false;
    t.append(m);
    return t;
  });
  field.replaceChildren(...tiles);
  const missing = tiles.filter((t) => {
    const entry = atlasCache[t.dataset.id];
    if (entry) showTile(t, entry);
    return !entry;
  });
  colorsRead = tiles.length - missing.length;
  if (missing.length) readColors(missing);
  else spectrumReady = true;
}
function spectrumOrder(rows) {
  const hueKey = (t) => {
    const c = colors.get(t.dataset.id);
    if (!c) return 1e4;
    return c[1] < NEUTRAL ? 1000 + (1 - c[2]) : (c[0] + 30) % 360;
  };
  const light = (t) => (colors.get(t.dataset.id) || [0, 0, 0])[2],
    sorted = [...tiles].sort((a, b) => hueKey(a) - hueKey(b)),
    columns = [];
  for (let i = 0; i < sorted.length; i += rows)
    columns.push(sorted.slice(i, i + rows).sort((a, b) => light(b) - light(a)));
  return columns;
}
function layoutAtlas(animate) {
  const W = field.clientWidth,
    H = field.clientHeight,
    n = tiles.length;
  if (!W || !H || !n) return;
  const across = (s) => Math.floor((W + GAP) / (s + GAP)),
    down = (s) => Math.floor((H + GAP) / (s + GAP));
  let side = Math.min(MAX_TILE, Math.sqrt((W * H) / n));
  while (side > 6 && across(side) * down(side) < n) side -= 0.25;
  const rows = Math.max(1, down(side)),
    wide = Math.max(1, across(side)),
    columns = arranged
      ? spectrumOrder(rows)
      : Array.from({ length: Math.min(wide, n) }, (_, c) => tiles.filter((_, i) => i % wide == c));
  const tall = Math.max(...columns.map((c) => c.length)),
    step = side + GAP,
    ox = (W - (columns.length * step - GAP)) / 2,
    oy = (H - (tall * step - GAP)) / 2;
  grid = { step, ox, oy };
  placed.clear();
  clearTimeout(settleTimer);
  field.classList.toggle("moving", animate);
  field.style.setProperty("--t", side + "px");
  columns.forEach((column, c) =>
    column.forEach((t, r) => {
      t.col = c;
      t.row = r;
      placed.set(c + ":" + r, t);
      t.style.transitionDelay = animate ? c * 12 + "ms" : "";
      t.style.transform = "translate(" + (ox + c * step) + "px," + (oy + r * step) + "px)";
    }),
  );
  if (animate) settleTimer = setTimeout(() => field.classList.remove("moving"), 1800);
}
function paintAtlas() {
  if (!tiles.length) return;
  for (const t of tiles) {
    t.classList.toggle("kept", kept.has(t.dataset.id));
    t.classList.toggle("skipped", skipped.has(t.dataset.id));
    t.classList.toggle("out", cardOf(t).style.display == "none");
  }
  const shown = visible();
  $("#atlasH").textContent = !spectrumReady
    ? "Đang đọc màu " + colorsRead + " / " + tiles.length
    : (shown.length == tiles.length ? tiles.length : shown.length + " / " + tiles.length) +
      " wallpaper, xếp theo màu";
  const n = shown.filter(undecided).length,
    b = $("#atlasSort");
  b.disabled = !n;
  b.innerHTML = !n
    ? "Đã duyệt hết"
    : (n == live.length ? "Bắt đầu duyệt" : "Duyệt " + n) + "<kbd>S</kbd>";
}
function openAtlas() {
  buildAtlas();
  // Paint first: the header text decides how much height is left for the tiles.
  paintAtlas();
  layoutAtlas(false);
  revealSpectrum();
}
function hidePeek() {
  $("#peek").hidden = true;
}
function showPeek(t) {
  const p = $("#peek"),
    c = cardOf(t),
    d = c.dataset,
    r = t.getBoundingClientRect();
  if (p.dataset.id != d.id) {
    p.dataset.id = d.id;
    p.classList.toggle("sensitive", isSensitive(c));
    p.querySelector("img").src = d.img;
    p.querySelector("b").textContent = d.title;
    p.querySelector("span").textContent = [d.kind, d.res, +d.size ? size(+d.size) : ""]
      .filter(Boolean)
      .join(" · ");
  }
  p.hidden = false;
  const w = p.offsetWidth,
    h = p.offsetHeight,
    x = r.right + 16 + w < innerWidth ? r.right + 16 : Math.max(8, r.left - 16 - w),
    y = Math.max(8, Math.min(innerHeight - h - 8, r.top + r.height / 2 - h / 2));
  p.style.transform = "translate(" + x + "px," + y + "px)";
}
function clearBrush() {
  for (const t of picked) t.classList.remove("sel");
  picked.clear();
  field.classList.remove("painting");
  $("#brushbar").hidden = true;
}
function leaveAtlas() {
  if (!tiles.length) return;
  hidePeek();
  clearBrush();
  brush = null;
}
function pickedCards() {
  return [...picked]
    .sort((a, b) => a.col - b.col || a.row - b.row)
    .map(cardOf)
    .filter(undecided);
}
function showBrushBar() {
  const n = pickedCards().length,
    b = $("#brushSort");
  $("#brushN").textContent = "Đã chọn " + picked.size + " wallpaper";
  b.textContent = n ? "Duyệt " + n + " ảnh này →" : "Đã duyệt hết";
  b.disabled = !n;
  $("#brushbar").hidden = false;
}
function colorVector(c) {
  const v = colors.get(c.dataset.id);
  if (!v) return null;
  const a = (v[0] * Math.PI) / 180;
  return [v[1] * 2 * Math.cos(a), v[1] * 2 * Math.sin(a), v[2]];
}
function openSimilar(t) {
  const first = cardOf(t),
    base = colorVector(first),
    rest = visible().filter((c) => c != first && undecided(c));
  const gap = (c) => {
    const v = colorVector(c);
    return base && v ? Math.hypot(base[0] - v[0], base[1] - v[1], base[2] - v[2]) : 1e9;
  };
  const ranked = rest.map((c) => [gap(c), c]).sort((a, b) => a[0] - b[0]);
  start([first, ...ranked.map((pair) => pair[1])]);
}
function tileAt(x, y) {
  const r = field.getBoundingClientRect(),
    c = Math.floor((x - r.left - grid.ox) / grid.step),
    row = Math.floor((y - r.top - grid.oy) / grid.step),
    t = placed.get(c + ":" + row);
  return t && !t.classList.contains("out") ? t : undefined;
}
function paintTo(x, y) {
  const steps = Math.max(1, Math.ceil(Math.hypot(x - brush.x, y - brush.y) / (grid.step / 2)));
  for (let i = 1; i <= steps; i++) {
    const t = tileAt(brush.x + ((x - brush.x) * i) / steps, brush.y + ((y - brush.y) * i) / steps);
    if (t && !picked.has(t)) {
      picked.add(t);
      t.classList.add("sel");
    }
  }
  brush.x = x;
  brush.y = y;
  field.classList.toggle("painting", picked.size > 1);
}
field.onpointerdown = (e) => {
  if (e.button || !grid) return;
  clearBrush();
  hidePeek();
  brush = { x: e.clientX, y: e.clientY, first: tileAt(e.clientX, e.clientY) };
  field.setPointerCapture(e.pointerId);
  if (brush.first) paintTo(e.clientX, e.clientY);
};
field.onpointermove = (e) => {
  if (!grid) return;
  if (brush) paintTo(e.clientX, e.clientY);
  else if (e.pointerType == "mouse") {
    const t = tileAt(e.clientX, e.clientY);
    if (t) showPeek(t);
    else hidePeek();
  }
};
field.onpointerleave = () => {
  if (!brush) hidePeek();
};
field.onpointerup = () => {
  if (!brush) return;
  const first = brush.first;
  brush = null;
  if (picked.size > 1) showBrushBar();
  else {
    clearBrush();
    if (first) openSimilar(first);
  }
};
field.onpointercancel = () => {
  brush = null;
  clearBrush();
};
// A click with detail 0 comes from the keyboard. Mouse and touch are handled above.
field.onclick = (e) => {
  const t = e.target.closest(".tile");
  if (t && !e.detail) openSimilar(t);
};
function moveFocus(dc, dr) {
  const now = tiles.find((t) => t.tabIndex == 0),
    at = document.activeElement == now ? [now.col + dc, now.row + dr] : [now.col, now.row],
    t = placed.get(at[0] + ":" + at[1]);
  if (!t) return;
  now.tabIndex = -1;
  t.tabIndex = 0;
  t.focus();
  showPeek(t);
}
addEventListener("resize", () => {
  const v = document.body.dataset.view;
  if (v == "atlas") layoutAtlas(false);
  if (v == "done") fitMosaic(kept.size);
});

// Filters, tag chips and wall order
const REMOVED = "__removed",
  MAX_CHIPS = 12,
  filters = $("#filters"),
  chosen = new Set(),
  tagsOf = new Map(
    cards.map((c) => [
      c,
      new Set(
        [c.dataset.kind, ...(c.dataset.tags ? c.dataset.tags.split("|") : [])].filter(Boolean),
      ),
    ]),
  );
function chip(tag, label, count) {
  const b = document.createElement("button"),
    n = document.createElement("small");
  b.type = "button";
  b.className = "chip";
  b.dataset.tag = tag;
  b.textContent = label;
  n.textContent = count;
  b.append(n);
  b.setAttribute("aria-pressed", "false");
  return b;
}
function buildChips() {
  const counts = new Map();
  for (const c of live) for (const t of tagsOf.get(c)) counts.set(t, (counts.get(t) || 0) + 1);
  const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, MAX_CHIPS),
    list = top.map(([t, n]) => chip(t, t, n)),
    removed = cards.length - live.length;
  if (removed) list.push(chip(REMOVED, "Đã xóa", removed));
  $("#chips").replaceChildren(...list);
}
function matchesChips(c) {
  for (const t of chosen) {
    if (t == REMOVED ? !!c.dataset.img : !tagsOf.get(c).has(t)) return false;
  }
  return true;
}
function applyFilter() {
  const v = $("#q").value.toLowerCase();
  let shown = 0;
  for (const c of cards) {
    const m = c.dataset.t.includes(v) && matchesChips(c);
    c.style.display = m ? "" : "none";
    shown += m;
  }
  for (const b of $("#chips").children) b.setAttribute("aria-pressed", chosen.has(b.dataset.tag));
  $("#clearFilters").hidden = !v && !chosen.size;
  $("#none").hidden = !!shown;
  paint();
}
function placeFilters(v) {
  if (v == "wall") $("#wallFilters").append(filters);
  if (v != "atlas") return;
  // Removed items have no tile, so that filter only makes sense on the wall.
  if (chosen.delete(REMOVED)) applyFilter();
  $("#atlasFilters").append(filters);
}
function applyOrder() {
  const value = (c, k) => +c.dataset[k] || 0,
    by = {
      list: (a, b) => a.dataset.n - b.dataset.n,
      subs: (a, b) => value(b, "subs") - value(a, "subs"),
      big: (a, b) => value(b, "size") - value(a, "size"),
      small: (a, b) => value(a, "size") - value(b, "size"),
      new: (a, b) => value(b, "time") - value(a, "time"),
    },
    key = $("#order").value,
    compare = (a, b) => (key != "list" && !!b.dataset.img - !!a.dataset.img) || by[key](a, b);
  cards.sort(compare);
  live.sort(compare);
  $("main").append(...cards);
}

// Blur for wallpapers tagged Mature or Questionable
const SHOW_KEY = "wpe-gallery-show-mature-v1",
  sensitiveCount = live.filter(isSensitive).length;
let showSensitive = false;
try {
  showSensitive = localStorage.getItem(SHOW_KEY) == "1";
} catch (e) {}
function paintSensitive() {
  document.body.classList.toggle("safe", !showSensitive);
  const m = $("#mature");
  m.hidden = !sensitiveCount;
  m.textContent = showSensitive
    ? "Làm mờ ảnh nhạy cảm"
    : "Hiện ảnh nhạy cảm (" + sensitiveCount + ")";
  $("#reveal").innerHTML = (showSensitive ? "Làm mờ ảnh này" : "Hiện ảnh này") + "<kbd>M</kbd>";
}
function toggleSensitive() {
  if (!sensitiveCount) return;
  showSensitive = !showSensitive;
  try {
    localStorage.setItem(SHOW_KEY, showSensitive ? "1" : "0");
  } catch (e) {}
  paintSensitive();
}

// Event wiring
$("#q").oninput = applyFilter;
$("#chips").onclick = (e) => {
  const b = e.target.closest(".chip");
  if (!b) return;
  if (!chosen.delete(b.dataset.tag)) chosen.add(b.dataset.tag);
  applyFilter();
};
$("#clearFilters").onclick = () => {
  $("#q").value = "";
  chosen.clear();
  applyFilter();
};
$("#order").onchange = () => {
  applyOrder();
  paint();
};
$("#mature").onclick = $("#reveal").onclick = toggleSensitive;
$("#exportP").onclick = exportProgress;
$("#importP").onclick = () => $("#importFile").click();
$("#importFile").onchange = (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (file) importProgress(file);
};
$("#keep").onclick = () => decide("k");
$("#skip").onclick = () => decide("s");
$("#undo").onclick = undo;
$("#toWall").onclick = $("#back").onclick = () => {
  paint();
  view("wall");
};
$("#toDone").onclick = $("#toDone2").onclick = $("#atlasDone").onclick = () => view("done");
$("#toAtlas").onclick = $("#toAtlas2").onclick = $("#toAtlas3").onclick = () => view("atlas");
$("#atlasWall").onclick = () => {
  paint();
  view("wall");
};
$("#atlasSort").onclick = () => start(visible().filter(undecided));
$("#brushSort").onclick = () => start(pickedCards());
$("#brushClear").onclick = clearBrush;
$("#sort").onclick = () => start(visible().filter(undecided));
$("#next").onclick = openNext;
$("#save").onclick = saveLinks;
$("#reset").onclick = () => {
  if (!confirm("Xóa toàn bộ lựa chọn Giữ và Bỏ qua của gallery này?")) return;
  kept.clear();
  skipped.clear();
  sent.clear();
  hist = [];
  paint();
  start(live.slice());
};
$("#mosaic").onclick = (e) => {
  const a = e.target.closest("a");
  if (a) {
    sent.add(a.dataset.id);
    persist();
    setTimeout(paintDone);
  }
};
$("main").onclick = (e) => {
  const pin = e.target.closest(".pin"),
    card = e.target.closest(".card");
  if (!card) return;
  if (pin) {
    const i = card.dataset.id;
    mark(i, kept.has(i) ? "" : "k");
    lastKept = "";
    paint();
    return;
  }
  if (
    !card.dataset.img ||
    e.button ||
    e.ctrlKey ||
    e.metaKey ||
    e.shiftKey ||
    !e.target.closest("a")
  )
    return;
  e.preventDefault();
  const at = live.indexOf(card);
  start([card, ...live.slice(at + 1).filter((c) => undecided(c) && c.style.display != "none")]);
};

// Drag a card left or right to decide
const hero = $("#hero");
let drag = null;
hero.onpointerdown = (e) => {
  drag = { x: e.clientX, id: e.pointerId };
  hero.setPointerCapture(e.pointerId);
};
hero.onpointermove = (e) => {
  if (!drag) return;
  const x = e.clientX - drag.x;
  drag.t = "translateX(" + x + "px) rotate(" + x / 28 + "deg)";
  hero.style.transform = drag.t;
};
hero.onpointerup = hero.onpointercancel = (e) => {
  if (!drag) return;
  const x = e.clientX - drag.x,
    t = drag.t;
  drag = null;
  hero.style.transform = "";
  if (Math.abs(x) > 110 && e.type == "pointerup") decide(x > 0 ? "k" : "s", t);
};

// Keyboard shortcuts
addEventListener("keydown", (e) => {
  if (e.target.matches("input")) {
    if (e.key == "Escape") e.target.blur();
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
  const k = e.key.toLowerCase(),
    v = document.body.dataset.view;
  let hit = true;
  if (k == "a" && v != "atlas") view("atlas");
  else if (k == "m" && sensitiveCount) toggleSensitive();
  else if (k == "z" && v != "stage" && v != "done" && hist.length) undo();
  else if (v == "atlas") {
    const arrows = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] };
    if (arrows[k]) moveFocus(...arrows[k]);
    else if (k == "/") $("#q").focus();
    else if (k == "s" && !$("#atlasSort").disabled) start(visible().filter(undecided));
    else if (k == "g") {
      paint();
      view("wall");
    } else if (k == "f") view("done");
    else if (k == "escape") clearBrush();
    else hit = false;
  } else if (v == "stage") {
    if (k == "arrowright" || k == "k") decide("k");
    else if (k == "arrowleft" || k == "x") decide("s");
    else if (k == "z") undo();
    else if (k == "o" && current()) window.open(url(current()), "_blank", "noopener");
    else if (k == "g" || k == "escape") {
      paint();
      view("wall");
    } else if (k == "f") view("done");
    else hit = false;
  } else if (v == "wall") {
    if (k == "/") $("#q").focus();
    else if (k == "f") view("done");
    else hit = false;
  } else {
    if (k == "n") openNext();
    else if (k == "z") undo();
    else if (k == "g" || k == "escape") {
      paint();
      view("wall");
    } else hit = false;
  }
  if (hit) e.preventDefault();
});

// Startup
const todo = live.filter(undecided);
buildChips();
paintSensitive();
paint();
if (live.length && todo.length == live.length) view("atlas");
else if (todo.length) start(todo);
else if (kept.size) view("done");
else view("wall");
