let scenes = {},
	currentId = "",
	photosWon = new Set();
const vars = {
	DATE: () => new Intl.DateTimeFormat("ru-RU").format(new Date()),
	ISO_DATE: () => new Date().toISOString().slice(0, 10),
	TIME: () =>
		new Date().toLocaleTimeString("ru-RU", {
			hour: "2-digit",
			minute: "2-digit",
		}),
	WEEK_DAY: () => new Date().toLocaleDateString("ru-RU", { weekday: "long" }),
	USER: () => "Игрок",
	CITY: () => "Москва",
};
const sample = {
	start: {
		lines: ["Привет! Как дела?"],
		options: [
			{ text: "Хорошо 😊", next: "end" },
			{ text: "Отстань", next: "end" },
		],
	},
	end: { lines: ["Спасибо за игру!"], options: [] },
};
const $chat = document.getElementById("chat");
const $quick = document.getElementById("quick");
const scrollDown = () =>
	requestAnimationFrame(() => {
		$chat.scrollTop = $chat.scrollHeight;
	});
function bubble(content, who = "char", isImg = false) {
	const wrap = document.createElement("div");
	wrap.className = `msg ${who}`;
	const b = document.createElement("div");
	b.className = "bubble";
	if (isImg) {
		const img = new Image();
		img.src = content;
		img.className = "chat-img";
		b.append(img);
	} else b.innerHTML = content;
	wrap.append(b);
	$chat.append(wrap);
	scrollDown();
}
const clearQuick = () => ($quick.innerHTML = "");
function renderQuick(opts) {
	opts.forEach((o) => {
		const btn = document.createElement("button");
		btn.className = "quick-btn";
		btn.textContent = o.text;
		btn.onclick = () => choose(o);
		$quick.append(btn);
	});
}
function choose(opt) {
	bubble(opt.text, "player");
	clearQuick();
	setTimeout(() => {
		currentId = opt.next;
		step();
	}, 400);
}
function step() {
	const s = scenes[currentId];
	if (!s) return;
	let delay = 0;
	s.lines.forEach((line) => {
		setTimeout(
			() => bubble(parseVars(line.content), "char", line.isPhoto),
			delay
		);
		delay += 650;
	});
	setTimeout(() => {
		const auto = s.options.find((o) => o.auto || (!o.text && o.next));
		if (auto) {
			currentId = auto.next || currentId;
			step();
			return;
		}
		renderQuick(s.options.filter((o) => !o.auto && o.text));
	}, delay + 200);
}
const parseVars = (str) =>
	str.replace(/\{([A-Z_]+)\}/g, (m, v) => (vars[v] ? vars[v]() : m));
function normalize(json) {
	if (!json.scenes) return json;
	const map = {};
	json.scenes.forEach((scene) => {
		const id = scene.id || scene.title;
		const lines = scene.photo
			? [{ content: scene.photo, isPhoto: true }]
			: (scene.line || "")
					.split(/\n/)
					.filter(Boolean)
					.map((l) => ({ content: l, isPhoto: false }));
		const options = scene.answers.map((a) => {
			const cmd = a.text?.match(/^\{([A-Z_]+)\}$/)?.[1];
			if (cmd === "NEXT") return { auto: true, next: a.next || null };
			if (cmd === "REPEAT") return { auto: true, next: id };
			if (!a.text && a.next) return { auto: true, next: a.next };
			return { text: a.text || "…", next: a.next || null };
		});
		map[id] = { lines, options };
	});
	currentId = json.scenes.find((s) => s.id)?.id || "start";
	return map;
}
function startGame(data) {
	scenes = data;
	$chat.innerHTML = "";
	clearQuick();
	photosWon.clear();
	document.getElementById("loaderCover").style.display = "none";
	step();
}
document.getElementById("fileInput").onchange = (e) => {
	const f = e.target.files[0];
	if (!f) return;
	const r = new FileReader();
	r.onload = (ev) => {
		startGame(normalize(JSON.parse(ev.target.result)));
	};
	r.readAsText(f);
};
document.getElementById("useSample").onclick = () => startGame(sample);
fetch("dialogues.json")
	.then((r) => (r.ok ? r.json() : Promise.reject()))
	.then((d) => startGame(normalize(d)))
	.catch(() => {});
document.addEventListener("contextmenu", (e) => e.preventDefault());
