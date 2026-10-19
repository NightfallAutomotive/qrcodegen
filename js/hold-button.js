/*
 * HoldButton, from React Bits (reactbits.dev).
 * Plain-JavaScript port of nightfall-os/src/app/components/HoldButton.tsx,
 * styled by css/hold-button.css. Options match the React props; `label`
 * replaces children.
 *
 * @example
 * new HoldButton(document.getElementById("generate"), {
 *    label : "Hold to generate",
 *    doneLabel : "Generated",
 *    onHold : function () { ... }
 * });
 */
var HoldButton;

(function () {
	var TAP_MS = 250;
	var HIT_PAD = 10;
	var LINEAR = function (t) { return t; };
	var EASE_OUT = function (t) { return 1 - Math.pow(1 - t, 3); };
	var nextId = 0;

	var DEFAULTS = {
		label : "Hold to delete",
		doneLabel : "Deleted",
		backgroundColor : "#27272a",
		fillColor : "#5227FF",
		textColor : "#f5f5f5",
		fillTextColor : "#ffffff",
		size : "md",
		radius : 14,
		fillDirection : "right",
		holdTime : 2000,
		releaseTime : 200,
		pressScale : 0.97,
		wave : true,
		waveAmplitude : 6,
		glow : true,
		resetAfter : 1200,
		disabled : false,
		onHold : null,
		onTap : null
	};

	function span(className, text) {
		var el = document.createElement("span");
		el.className = className;
		if (text != null) el.textContent = text;
		return el;
	}

	function labels(o) {
		var wrap = document.createDocumentFragment();
		wrap.appendChild(span("hold-button__idle", o.label));
		wrap.appendChild(span("hold-button__done", o.doneLabel));
		return wrap;
	}

	function label(o, extraClass) {
		var el = span("hold-button__label" + (extraClass ? " " + extraClass : ""));
		el.appendChild(labels(o));
		return el;
	}

	/**
	 * @constructor
	 * @param {HTMLButtonElement} button empty <button> to turn into a hold button
	 * @param {Object} vOption see DEFAULTS
	 */
	HoldButton = function (button, vOption) {
		var o = {};
		var k;

		for (k in DEFAULTS) o[k] = DEFAULTS[k];
		for (k in vOption) o[k] = vOption[k];

		this._o = o;
		this._button = button;
		this._phase = "idle";
		this._input = null;
		this._gesture = { pointerId: null, start: 0, rect: null };
		this._timers = { complete: 0, reset: 0 };
		this._motion = { raf: 0, p: 0, from: 0, to: 0, start: 0 };

		this._build();
		this._bind();
		this._render();
	};

	HoldButton.prototype._build = function () {
		var o = this._o;
		var button = this._button;
		var hintId = "hold-button-hint-" + (++nextId);
		var vars = {
			"--hb-radius": o.radius + "px",
			"--hb-bg": o.backgroundColor,
			"--hb-fill": o.fillColor,
			"--hb-text": o.textColor,
			"--hb-fill-text": o.fillTextColor,
			"--hb-hold": o.holdTime + "ms",
			"--hb-cycles": o.holdTime / 1100,
			"--hb-release": o.releaseTime + "ms",
			"--hb-press": o.pressScale,
			"--hb-wave": (o.wave ? o.waveAmplitude : 0) + "px"
		};

		button.type = "button";
		button.disabled = o.disabled;
		button.classList.add("hold-button", "hold-button--" + o.size);
		button.setAttribute("data-direction", o.fillDirection === "up" ? "up" : "right");
		if (o.glow) button.setAttribute("data-glow", "true");
		button.setAttribute("aria-describedby", hintId);
		for (var name in vars) button.style.setProperty(name, vars[name]);

		var clip = span("hold-button__clip");
		var fill = span("hold-button__fill");
		var crest = span("hold-button__crest");
		var hint = span("hold-button__sr", "Press and hold for " + Math.round(o.holdTime / 100) / 10 + " seconds to confirm");

		clip.setAttribute("aria-hidden", "true");
		crest.setAttribute("aria-hidden", "true");
		fill.appendChild(label(o, "hold-button__label--fill"));
		crest.appendChild(label(o, "hold-button__label--fill"));
		clip.appendChild(fill);
		clip.appendChild(crest);
		hint.id = hintId;

		var pulse = span("hold-button__pulse");
		pulse.setAttribute("aria-hidden", "true");

		button.textContent = "";
		button.appendChild(pulse);
		button.appendChild(label(o));
		button.appendChild(clip);
		button.appendChild(hint);
	};

	HoldButton.prototype._bind = function () {
		var self = this;
		var button = this._button;

		button.addEventListener("pointerdown", function (e) {
			if (e.button !== 0 || !e.isPrimary || self._gesture.pointerId !== null) return;
			if (!self._begin("pointer")) return;
			self._gesture.pointerId = e.pointerId;
			try {
				button.setPointerCapture(e.pointerId);
			} catch (err) {}
		});
		button.addEventListener("pointermove", function (e) {
			if (e.pointerId !== self._gesture.pointerId) return;
			var r = self._gesture.rect;
			if (!r) return;
			var out =
				e.clientX < r.left - HIT_PAD ||
				e.clientX > r.right + HIT_PAD ||
				e.clientY < r.top - HIT_PAD ||
				e.clientY > r.bottom + HIT_PAD;
			if (out) self._endPointer(e, { drifted: true });
		});
		button.addEventListener("pointerup", function (e) { self._endPointer(e); });
		button.addEventListener("pointercancel", function (e) { self._endPointer(e, { drifted: true }); });
		button.addEventListener("lostpointercapture", function (e) { self._endPointer(e, { drifted: true }); });
		button.addEventListener("pointerleave", function (e) {
			if (e.pointerType !== "touch") self._endPointer(e, { drifted: true });
		});
		button.addEventListener("keydown", function (e) {
			if (e.key === "Escape") {
				if (self._input === "key") self._release({ drifted: true });
				return;
			}
			if (e.key === " " || e.key === "Enter") {
				e.preventDefault();
				if (!e.repeat) self._begin("key");
			}
		});
		button.addEventListener("keyup", function (e) {
			if (e.key === " " || e.key === "Enter") {
				e.preventDefault();
				if (self._input === "key") self._release();
			}
		});
		button.addEventListener("contextmenu", function (e) { e.preventDefault(); });

		// Losing the window mid-hold cancels the hold
		window.addEventListener("blur", function () {
			if (self._phase === "holding") self._release({ drifted: true });
		});
		document.addEventListener("visibilitychange", function () {
			if (document.hidden && self._phase === "holding") self._release({ drifted: true });
		});

		var measure = function () {
			button.style.setProperty("--hb-w", button.offsetWidth + "px");
			button.style.setProperty("--hb-h", button.offsetHeight + "px");
		};
		measure();
		if (typeof ResizeObserver != "undefined") new ResizeObserver(measure).observe(button);
	};

	HoldButton.prototype._go = function (next, kind) {
		this._phase = next;
		this._input = kind || null;
		this._render();
	};

	HoldButton.prototype._render = function () {
		var button = this._button;
		var done = this._phase === "done";

		button.setAttribute("data-phase", this._phase);
		if (this._input) button.setAttribute("data-input", this._input);
		else button.removeAttribute("data-input");

		// Only the visible label copy is exposed to screen readers
		var visible = button.querySelector(":scope > .hold-button__label");
		visible.querySelector(".hold-button__idle").setAttribute("aria-hidden", done ? "true" : "false");
		visible.querySelector(".hold-button__done").setAttribute("aria-hidden", done ? "false" : "true");
	};

	HoldButton.prototype._clearTimers = function () {
		clearTimeout(this._timers.complete);
		clearTimeout(this._timers.reset);
	};

	HoldButton.prototype._drive = function (to, duration, ease) {
		var self = this;
		var m = this._motion;

		cancelAnimationFrame(m.raf);
		m.from = m.p;
		m.to = to;
		m.start = performance.now();

		var step = function (now) {
			var t = duration > 0 ? Math.min(1, (now - m.start) / duration) : 1;
			m.p = m.from + (m.to - m.from) * ease(t);
			self._button.style.setProperty("--hb-p", m.p.toFixed(4));
			if (t < 1) {
				m.raf = requestAnimationFrame(step);
				return;
			}
			m.raf = 0;
			if (m.to === 1) self._complete();
		};
		m.raf = requestAnimationFrame(step);
	};

	HoldButton.prototype._complete = function () {
		var self = this;
		var o = this._o;

		if (this._phase !== "holding") return;
		if (performance.now() - this._gesture.start < o.holdTime - 50) return;
		this._clearTimers();
		this._go("done", this._input);
		if (o.onHold) o.onHold();
		if (o.resetAfter > 0) {
			this._timers.reset = setTimeout(function () {
				self._go("idle");
				self._drive(0, o.releaseTime, EASE_OUT);
			}, o.resetAfter);
		}
	};

	HoldButton.prototype._begin = function (kind) {
		var self = this;

		if (this._button.disabled || this._phase !== "idle") return false;
		this._gesture.start = performance.now();
		this._gesture.rect = this._button.getBoundingClientRect();
		this._go("holding", kind);
		this._drive(1, this._o.holdTime, LINEAR);
		this._timers.complete = setTimeout(function () { self._complete(); }, this._o.holdTime + 100);
		return true;
	};

	HoldButton.prototype._release = function (options) {
		var drifted = options && options.drifted;

		if (this._phase !== "holding") return;
		this._clearTimers();
		var held = performance.now() - this._gesture.start;
		this._go("idle");
		this._drive(0, this._o.releaseTime, EASE_OUT);
		if (!drifted && held < TAP_MS && this._o.onTap) this._o.onTap();
	};

	HoldButton.prototype._endPointer = function (e, options) {
		if (e.pointerId !== this._gesture.pointerId) return;
		this._gesture.pointerId = null;
		try {
			if (this._button.hasPointerCapture(e.pointerId)) this._button.releasePointerCapture(e.pointerId);
		} catch (err) {}
		this._release(options);
	};
})();
