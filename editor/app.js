(() => {
	"use strict";

	const editor = document.getElementById("editor");
	const canvas = document.getElementById("canvas");
	const svg = document.getElementById("wires");

	const tplMsg = document.getElementById("tpl-node").content;
	const tplPhoto = document.getElementById("tpl-photo").content;

	const btnAddMsg = document.getElementById("btn-add-msg");
	const btnAddPhoto = document.getElementById("btn-add-photo");
	const btnExport = document.getElementById("btn-export");
	const btnPan = document.getElementById("btn-pan");
	const btnVars = document.getElementById("btn-vars");
	const btnScenes = document.getElementById("btn-scenes");

	const fileImport = document.getElementById("file-import");

	const btnConsTgl = document.getElementById("btn-console-toggle");
	const btnConsClr = document.getElementById("btn-console-clear");
	const btnConsCls = document.getElementById("btn-console-close");
	const consPanel = document.getElementById("console-panel");
	const consBody = document.getElementById("console-content");
	const consCount = document.getElementById("console-count");

	const varPanel = document.getElementById("vars-panel");
	const scenePanel = document.getElementById("scenes-panel");
	const sceneList = document.getElementById("scene-list");
	const LS_KEY = "dialog_editor_state";
	const debounce = (fn, wait = 600) => {
		let t;
		return (...a) => {
			clearTimeout(t);
			t = setTimeout(() => fn(...a), wait);
		};
	};
	const saveState = () => {
		localStorage.setItem(LS_KEY, JSON.stringify({ scenes: scenesJSON() }));
	};
	const autosave = () => {
		debounce(saveState)();
	};

	const btnClear = document.getElementById("btn-clear-storage");
	btnClear.onclick = () => {
		localStorage.removeItem(LS_KEY);
		canvas.innerHTML = "";
		svg.querySelectorAll("g").forEach((g) => g.remove());
		sceneCnt = answerSeq = 0;
		createNode();
		log("info", "Сцены и хранилище очищены");
	};

	const scenesJSON = () =>
		[...canvas.children].map((n) => ({
			id: n.dataset.id,
			title: n.querySelector(".title").value.trim(),
			line:
				n.dataset.type === "photo"
					? ""
					: n.querySelector(".lines")
					? n.querySelector(".lines").value
					: "",
			photo: n.dataset.photo || undefined,
			position: {
				x: +parseInt(n.style.left),
				y: +parseInt(n.style.top),
			},
			answers: [...n.querySelectorAll(".answer")].map((li) => ({
				id: li.querySelector(".answer-port").dataset.answerId,
				text: li.querySelector(".answer-text").value.trim(),
				next: li.dataset.next || null,
			})),
		}));

	let sceneCnt = 0,
		zTop = 10,
		answerSeq = 0;
	const logs = [];
	const drag = { port: null, tempGrp: null, tempPath: null };
	const pan = {
		enabled: false,
		space: false,
		active: false,
		sx: 0,
		sy: 0,
		tx: 0,
		ty: 0,
	};
	const PAN_DURATION = 300;

	const TEXT_VARS = [
		{ code: "DATE", desc: "Текущая дата (ДД.MM.ГГГГ)" },
		{ code: "ISO_DATE", desc: "Текущая дата (YYYY-MM-DD)" },
		{ code: "TIME", desc: "Текущее время (HH:MM)" },
		{ code: "WEEK_DAY", desc: "День недели" },
		{ code: "USER", desc: "Имя пользователя" },
		{ code: "CITY", desc: "Город пользователя" },
	];
	const CMD_VARS = [
		{ code: "NEXT", desc: "Переход к следующей сцене" },
		{ code: "REPEAT", desc: "Повтор текущей сцены" },
	];
	const TEXT_CODES = TEXT_VARS.map((v) => v.code);
	const CMD_CODES = CMD_VARS.map((v) => v.code);

	let currentField = null;

	const log = (type, msg) => {
		const line = document.createElement("div");
		line.className = `msg-${type}`;
		line.textContent = `${type.toUpperCase()}: ${msg}`;
		logs.push(line);
		consBody.append(line);
		consBody.scrollTop = consBody.scrollHeight;
		consCount.textContent = logs.length;
	};
	const logScene = (title, type, msg) => log(type, `[${title}] ${msg}`);

	const toggle = (panel, btn) => {
		const open = !panel.classList.contains("open");
		panel.classList.toggle("open", open);
		btn.classList.toggle("active", open);
	};

	(() => {
		const addSection = (caption, list, cls) => {
			const h = document.createElement("div");
			h.className = "panel-title";
			h.textContent = caption;
			varPanel.append(h);
			list.forEach((v) => {
				const row = document.createElement("div");
				row.className = "var-row";
				const b = document.createElement("button");
				b.className = cls;
				b.textContent = `{${v.code}}`;
				b.onclick = () => insertVar(v.code, cls);
				const d = document.createElement("span");
				d.textContent = v.desc;
				row.append(b, d);
				varPanel.append(row);
			});
		};
		addSection("Текстовые", TEXT_VARS, "text-var");
		varPanel.append(document.createElement("hr"));
		addSection("Командные", CMD_VARS, "cmd-var");
	})();

	const insertVar = (code, cls) => {
		const el = currentField || document.activeElement;
		if (!(el && el.matches("textarea,input"))) {
			log("warning", "Нет активного поля");
			return;
		}
		const tag = `{${code}}`;
		if (cls === "cmd-var") {
			if (!el.closest(".answer")) {
				log("error", "Командные переменные только в ответах");
				return;
			}
			el.value = tag;
		} else {
			const pos = el.selectionStart;
			el.value = el.value.slice(0, pos) + tag + el.value.slice(el.selectionEnd);
			el.selectionStart = el.selectionEnd = pos + tag.length;
		}
		el.focus();
	};
	document.addEventListener("focusin", (e) => {
		if (e.target.matches("textarea,input")) currentField = e.target;
	});

	const uid = () => `scene_${++sceneCnt}`;
	const svgBox = () => svg.getBoundingClientRect();
	const relPos = (x, y) => {
		const b = svgBox();
		return { x: x - b.left, y: y - b.top };
	};
	const portPos = (p) => {
		const r = p.getBoundingClientRect();
		return relPos(r.left + 8, r.top + 8);
	};
	const nodeAnchor = (n) => {
		const r = n.getBoundingClientRect();
		return relPos(r.left, r.top + r.height * 0.25);
	};
	const centerViewport = () => ({
		x: -pan.tx + innerWidth / 2,
		y: -pan.ty + innerHeight / 2,
	});

	const makePath = (from, to) => {
		const g = svg.appendChild(document.createElementNS(svg.namespaceURI, "g"));
		const hit = document.createElementNS(svg.namespaceURI, "path");
		hit.classList.add("link-hit");
		hit.setAttribute("stroke", "transparent");
		hit.setAttribute("stroke-width", "26");
		hit.setAttribute("stroke-linecap", "round");
		hit.style.pointerEvents = "stroke";
		hit.dataset.from = from;

		const main = document.createElementNS(svg.namespaceURI, "path");
		main.classList.add("link");
		main.setAttribute("fill", "none");
		main.setAttribute("marker-end", "url(#arrow)");
		main.style.pointerEvents = "none";
		main.dataset.from = from;
		main.dataset.to = to;

		hit.onmouseenter = () => main.classList.add("hover");
		hit.onmouseleave = () => main.classList.remove("hover");
		hit.ondblclick = () => removeLink(from);

		g.append(main, hit);
		return main;
	};
	const updatePath = (p) => {
		const a = document.querySelector(
			`.answer-port[data-answer-id="${p.dataset.from}"]`
		);
		const b = document.querySelector(`.node[data-id="${p.dataset.to}"]`);
		if (!(a && b)) return;
		const A = portPos(a),
			B = nodeAnchor(b);
		const M = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
		const d = `M${A.x},${A.y} L${M.x},${M.y} L${B.x},${B.y}`;
		p.setAttribute("d", d);
		p.nextSibling.setAttribute("d", d);
	};

	const applyPan = () => {
		const t = `translate(${pan.tx}px,${pan.ty}px)`;
		canvas.style.transform = t;
		svg.style.transform = t;
	};
	const smoothPanTo = (x, y, dur = PAN_DURATION) => {
		const x0 = pan.tx,
			y0 = pan.ty,
			dx = x - x0,
			dy = y - y0,
			t0 = performance.now();
		const ease = (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);
		const step = (now) => {
			const p = Math.min(1, (now - t0) / dur);
			pan.tx = x0 + dx * ease(p);
			pan.ty = y0 + dy * ease(p);
			applyPan();
			if (p < 1) requestAnimationFrame(step);
		};
		requestAnimationFrame(step);
	};

	const refreshSceneList = () => {
		sceneList.innerHTML = "";
		[...canvas.children].forEach((n) => {
			const li = document.createElement("li");
			li.textContent = n.querySelector(".title").value || "(без названия)";
			li.onclick = () => {
				const cx = n.offsetLeft + n.offsetWidth / 2;
				const cy = n.offsetTop + n.offsetHeight / 2;
				smoothPanTo(innerWidth / 2 - cx, innerHeight / 2 - cy);
				autosave();
			};
			sceneList.append(li);
		});
	};

	const removeLink = (id) => {
		svg
			.querySelectorAll(`path.link[data-from="${id}"]`)
			.forEach((p) => p.parentNode.remove());
		const port = document.querySelector(`.answer-port[data-answer-id="${id}"]`);
		port?.classList.remove("connected");
		port?.parentElement.removeAttribute("data-next");
		autosave();
	};
	const saveLink = (port, target) => {
		removeLink(port.dataset.answerId);
		const path = makePath(port.dataset.answerId, target.dataset.id);
		updatePath(path);
		port.classList.add("connected");
		port.parentElement.dataset.next = target.dataset.id;
		autosave();
	};

	const addAnswer = (node, answerData = { text: "", next: null, id: null }) => {
		const li = document.createElement("li");
		li.className = "answer";

		const txt = document.createElement("textarea");
		txt.className = "answer-text";
		txt.placeholder = "Ответ...";
		txt.value = answerData.text;

		const del = document.createElement("button");
		del.className = "del";
		const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		icon.innerHTML = '<use href="#ico-trash" />';
		del.append(icon);

		const port = document.createElement("div");
		port.className = "answer-port";
		port.dataset.answerId = answerData.id || `ans_${++answerSeq}`;

		li.append(txt, del, port);
		node.querySelector(".answers").append(li);

		if (answerData.next) {
			const target = document.querySelector(
				`.node[data-id="${answerData.next}"]`
			);
			if (target) saveLink(port, target);
		}

		del.onclick = () => {
			const list = node.querySelectorAll(".answer");
			if (list.length > 1) {
				removeLink(port.dataset.answerId);
				li.remove();
			} else
				logScene(
					node.querySelector(".title").value,
					"warning",
					"Нужен как минимум один ответ"
				);
			autosave();
		};

		port.onpointerdown = (e) => {
			e.stopPropagation();
			port.setPointerCapture(e.pointerId);
			drag.port = port;
			drag.tempGrp = svg.appendChild(
				document.createElementNS(svg.namespaceURI, "g")
			);
			drag.tempPath = document.createElementNS(svg.namespaceURI, "path");
			drag.tempPath.setAttribute("stroke", "#9e9e9e");
			drag.tempPath.setAttribute("stroke-width", "2.5");
			drag.tempPath.setAttribute("fill", "none");
			drag.tempPath.style.pointerEvents = "none";
			drag.tempGrp.appendChild(drag.tempPath);

			port.onpointermove = drawTemp;
			port.onpointerup = (ev) => finishTemp(ev, port, node);
			port.oncontextmenu = (ev) => removeLink(port.dataset.answerId);
		};
		autosave();
	};

	const drawTemp = (e) => {
		const A = portPos(drag.port),
			B = relPos(e.clientX, e.clientY);
		const M = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
		drag.tempPath.setAttribute(
			"d",
			`M${A.x},${A.y} L${M.x},${M.y} L${B.x},${B.y}`
		);
	};
	const finishTemp = (ev, port, node) => {
		port.releasePointerCapture(ev.pointerId);
		port.onpointermove = port.onpointerup = null;
		drag.tempGrp.remove();

		const tgt = document
			.elementFromPoint(ev.clientX, ev.clientY)
			?.closest(".node");
		tgt
			? saveLink(port, tgt)
			: logScene(
					node.querySelector(".title").value,
					"warning",
					"Соединение не завершено"
			  );
		drag.port = drag.tempGrp = drag.tempPath = null;
	};

	const markRoot = () => {
		[...canvas.children].forEach((n, i) => {
			n.classList.toggle("start", i === 0);
			const d = n.querySelector(".del-node");
			if (d) d.style.display = i === 0 ? "none" : "inline-block";
		});
	};
	const removeScene = (node) => {
		svg
			.querySelectorAll(`path.link[data-to="${node.dataset.id}"]`)
			.forEach((p) => removeLink(p.dataset.from));
		svg
			.querySelectorAll(
				`path.link[data-from^="${node.dataset.id}_"],path.link[data-from^="ans_"]`
			)
			.forEach((p) => removeLink(p.dataset.from));
		node.remove();
		markRoot();
		refreshSceneList();
		autosave();
	};

	const makeDrag = (node) => {
		const head = node.querySelector(".drag-handle");
		head.onpointerdown = (ev) => {
			if (pan.enabled || ev.target.closest(".answer-port,.title,.del-node"))
				return;
			node.classList.add("dragging");
			node.style.zIndex = ++zTop;
			const dx = ev.clientX - pan.tx - parseFloat(node.style.left || 0);
			const dy = ev.clientY - pan.ty - parseFloat(node.style.top || 0);

			const move = (m) => {
				node.style.left = m.clientX - pan.tx - dx + "px";
				node.style.top = m.clientY - pan.ty - dy + "px";
				svg
					.querySelectorAll(
						`path.link[data-from^="ans_"],path.link[data-to="${node.dataset.id}"]`
					)
					.forEach(updatePath);
			};
			const up = () => {
				node.classList.remove("dragging");
				window.removeEventListener("pointermove", move);
				window.removeEventListener("pointerup", up);
				autosave();
			};
			window.addEventListener("pointermove", move);
			window.addEventListener("pointerup", up);
		};
	};

	const createNode = (x, y, type = "msg", importData = null) => {
		if (typeof x !== "number" || typeof y !== "number") {
			const c = centerViewport(),
				off = 90;
			x = c.x + Math.round((Math.random() - 0.5) * off);
			y = c.y + Math.round((Math.random() - 0.5) * off);
		}
		const node = (type === "photo" ? tplPhoto : tplMsg).cloneNode(
			true
		).firstElementChild;
		node.dataset.id = importData?.id || uid();
		node.dataset.type = type;
		Object.assign(node.style, {
			left: `${x}px`,
			top: `${y}px`,
			zIndex: ++zTop,
		});

		const head = node.querySelector(".drag-handle");
		const title = head.querySelector(".title");
		title.value = importData?.title || `Сцена ${sceneCnt}`;
		title.readOnly = true;
		title.style.pointerEvents = "none";

		head.ondblclick = () => {
			title.readOnly = false;
			title.style.pointerEvents = "auto";
			title.classList.add("edit");
			title.focus();
			title.select();
		};
		title.onblur = () => {
			title.readOnly = true;
			title.style.pointerEvents = "none";
			title.classList.remove("edit");
			refreshSceneList();
		};

		const btnDel = head.querySelector(".del-node");
		btnDel.onclick = () => {
			if (node.classList.contains("start")) {
				log("error", "Нельзя удалить корень");
				return;
			}
			removeScene(node);
			autosave();
		};

		if (type === "photo") {
			const inp = node.querySelector(".upload");
			const prev = node.querySelector(".photo-prev");
			if (importData?.photo) {
				prev.src = importData.photo;
				node.dataset.photo = importData.photo;
			}
			inp.onchange = async (e) => {
				const f = e.target.files[0];
				if (!f) return;

				const dataURL = await fileToDataUrlCompressed(f, 800, 0.8);
				prev.src = dataURL;
				node.dataset.photo = dataURL;
			};
		} else if (importData?.line) {
			node.querySelector(".lines").value = importData.line;
		}

		const addBtn = node.querySelector(".add-answer");
		addBtn.onclick = () => {
			addAnswer(node);
		};
		if (importData?.answers?.length) {
			importData.answers.forEach((a) => addAnswer(node, a));
		} else addAnswer(node);

		canvas.appendChild(node);
		makeDrag(node);
		markRoot();
		refreshSceneList();
		autosave();
		return node;
	};

	function fileToDataUrlCompressed(file, maxW = 800, quality = 0.8) {
		return new Promise((res) => {
			const img = new Image();
			img.onload = () => {
				const ratio = Math.min(1, maxW / img.width);
				const w = img.width * ratio;
				const h = img.height * ratio;
				const c = document.createElement("canvas");
				c.width = w;
				c.height = h;
				c.getContext("2d").drawImage(img, 0, 0, w, h);
				res(c.toDataURL("image/jpeg", quality));
			};
			const fr = new FileReader();
			fr.onload = (e) => (img.src = e.target.result);
			fr.readAsDataURL(file);
		});
	}

	const validate = () => {
		let ok = true;

		canvas.querySelectorAll(".node").forEach((node) => {
			const title = node.querySelector(".title").value;

			if (node.dataset.type !== "photo") {
				node.querySelector(".lines").value.replace(/\{([A-Z_]+)\}/g, (m, v) => {
					if (CMD_CODES.includes(v)) {
						ok = false;
						logScene(title, "error", `{${v}} недопустима в реплике`);
					} else if (!TEXT_CODES.includes(v)) {
						ok = false;
						logScene(title, "error", `Неизвестная переменная {${v}}`);
					}
				});
			}

			node.querySelectorAll(".answer").forEach((ans) => {
				const txt = ans.querySelector(".answer-text").value.trim();
				const solo = txt.match(/^\{([A-Z_]+)\}$/);
				const hasLink = !!ans.dataset.next;

				if (solo) {
					if (!CMD_CODES.includes(solo[1])) {
						ok = false;
						logScene(
							title,
							"error",
							`Неизвестная командная переменная {${solo[1]}}`
						);
					}
					if (hasLink) {
						ok = false;
						logScene(
							title,
							"error",
							"У командного ответа не должно быть ссылки"
						);
					}
					return; // дальше проверять не нужно
				}

				txt.replace(/\{([A-Z_]+)\}/g, (m, v) => {
					if (CMD_CODES.includes(v)) {
						ok = false;
						logScene(
							title,
							"error",
							`Командная {${v}} должна быть единственной в ответе`
						);
					} else if (!TEXT_CODES.includes(v)) {
						ok = false;
						logScene(title, "error", `Неизвестная переменная {${v}}`);
					}
				});
			});
		});

		return ok;
	};

	btnAddMsg.onclick = () => {
		createNode();
	};
	btnAddPhoto.onclick = () => {
		createNode(undefined, undefined, "photo");
	};
	btnExport.onclick = () => {
		if (!validate()) {
			log("warning", "Экспорт отменён");
			return;
		}
		const scenes = [...canvas.children].map((n) => ({
			id: n.dataset.id,
			title: n.querySelector(".title").value.trim(),
			line:
				n.dataset.type === "photo"
					? ""
					: n.querySelector(".lines")
					? n.querySelector(".lines").value
					: "",
			photo: n.dataset.photo || undefined,
			position: { x: +parseInt(n.style.left), y: +parseInt(n.style.top) },
			answers: [...n.querySelectorAll(".answer")].map((li) => ({
				id: li.querySelector(".answer-port").dataset.answerId,
				text: li.querySelector(".answer-text").value.trim(),
				next: li.dataset.next || null,
			})),
		}));

		const url = URL.createObjectURL(
			new Blob([JSON.stringify({ scenes }, null, 2)], {
				type: "application/json",
			})
		);
		const a = document.createElement("a");
		a.href = url;
		a.download = "dialogues.json";
		document.body.append(a); // нужен некоторым браузерам
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
		log("info", "Экспорт завершён");
	};
	btnPan.onclick = () => {
		pan.enabled = !pan.enabled;
		btnPan.classList.toggle("active", pan.enabled);
		editor.classList.toggle("panning", pan.enabled);
	};
	btnVars.onclick = () => toggle(varPanel, btnVars);
	btnScenes.onclick = () => toggle(scenePanel, btnScenes);
	btnConsTgl.onclick = () => toggle(consPanel, btnConsTgl);
	btnConsClr.onclick = () => {
		consBody.innerHTML = "";
		logs.length = 0;
		consCount.textContent = 0;
	};
	btnConsCls.onclick = btnConsTgl.onclick;

	fileImport.onchange = (e) => {
		const f = e.target.files[0];
		if (!f) return;
		const fr = new FileReader();
		fr.onload = (ev) => {
			try {
				const data = JSON.parse(ev.target.result);
				if (!Array.isArray(data.scenes)) throw Error("scenes[] not found");
				canvas.innerHTML = "";
				svg.querySelectorAll("g").forEach((g) => g.remove());
				sceneCnt = 0;
				answerSeq = 0;
				const map = {};
				data.scenes.forEach((s) => {
					const n = createNode(
						s.position.x,
						s.position.y,
						s.photo ? "photo" : "msg",
						s
					);
					map[s.id] = n;
				});
				data.scenes.forEach((s) => {
					s.answers.forEach((a) => {
						if (!a.next) return;
						const src = document.querySelector(
							`.answer-port[data-answer-id="${a.id}"]`
						);
						const dst = map[a.next];
						if (src && dst) saveLink(src, dst);
					});
				});
				log("info", "Импорт завершён");
			} catch (err) {
				log("error", "Ошибка импорта: " + err.message);
			}
		};
		fr.readAsText(f, "utf-8");
	};

	addEventListener("keydown", (e) => {
		if (
			e.code === "Space" &&
			!["INPUT", "TEXTAREA"].includes(e.target.tagName)
		) {
			pan.space = true;
			btnPan.classList.add("active");
			e.preventDefault();
		}
	});
	addEventListener("keyup", (e) => {
		if (e.code === "Space") {
			pan.space = false;
			if (!pan.enabled) {
				btnPan.classList.remove("active");
				editor.classList.remove("panning");
			}
		}
	});

	editor.addEventListener("contextmenu", (e) => {
		if (!e.target.closest("textarea,input")) e.preventDefault();
	});

	editor.onpointerdown = (ev) => {
		if (
			!(pan.enabled || pan.space) ||
			ev.button ||
			ev.target.closest(".node,.answer-port")
		)
			return;
		pan.active = true;
		editor.classList.add("panning", "grabbing");
		pan.sx = ev.clientX - pan.tx;
		pan.sy = ev.clientY - pan.ty;
	};
	editor.onpointermove = (ev) => {
		if (!pan.active) return;
		pan.tx = ev.clientX - pan.sx;
		pan.ty = ev.clientY - pan.sy;
		applyPan();
	};
	editor.onpointerup = () => {
		pan.active = false;
		editor.classList.remove("grabbing");
		if (!(pan.enabled || pan.space)) editor.classList.remove("panning");
	};

	addEventListener("resize", () =>
		svg.querySelectorAll("path.link").forEach(updatePath)
	);

	document
		.querySelectorAll(".sidebar button, .sidebar .file-btn")
		.forEach((btn) => {
			if (btn.title) {
				btn.dataset.tip = btn.title;
				btn.removeAttribute("title");
			}
		});

	const importScenes = (scenes) => {
		canvas.innerHTML = "";
		svg.querySelectorAll("g").forEach((g) => g.remove());
		sceneCnt = 0;
		answerSeq = 0;

		const map = {};
		scenes.forEach((s) => {
			const n = createNode(
				s.position.x,
				s.position.y,
				s.photo ? "photo" : "msg",
				s
			);
			map[s.id] = n;
		});

		scenes.forEach((s) =>
			s.answers.forEach((a) => {
				if (!a.next) return;
				const src = document.querySelector(
					`.answer-port[data-answer-id="${a.id}"]`
				);
				const dst = map[a.next];
				if (src && dst) saveLink(src, dst);
			})
		);

		const safeMax = (arr) =>
			arr.length ? Math.max(...arr.filter(Number.isFinite)) : 0;

		sceneCnt = safeMax(scenes.map((s) => +String(s.id).split("_").pop()));
		answerSeq = safeMax(
			scenes.flatMap((s) =>
				s.answers.map((a) => +String(a.id).split("_").pop())
			)
		);

		markRoot();
		refreshSceneList();
	};

	const raw = localStorage.getItem(LS_KEY);
	if (raw) {
		try {
			const data = JSON.parse(raw);
			if (Array.isArray(data.scenes)) {
				importScenes(data.scenes);
			}
		} catch (e) {}
	} else {
		createNode();
	}
})();
