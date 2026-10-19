/*
 * Nord-themed colour picker. Upgrades an <input type="color"> with a swatch
 * button that opens the Nord palette, a hex field and a way back to the
 * browser's own picker. The input stays the source of truth: picking a
 * colour sets its value and fires "input", so existing listeners keep working.
 *
 * @example
 * new NordPicker(document.getElementById("color-dark"), { label : "Code colour" });
 */
var NordPicker;

(function () {
	var PALETTE = [
		{ name : "Polar Night", colors : [["nord0", "#2e3440"], ["nord1", "#3b4252"], ["nord2", "#434c5e"], ["nord3", "#4c566a"]] },
		{ name : "Snow Storm", colors : [["nord4", "#d8dee9"], ["nord5", "#e5e9f0"], ["nord6", "#eceff4"]] },
		{ name : "Frost", colors : [["nord7", "#8fbcbb"], ["nord8", "#88c0d0"], ["nord9", "#81a1c1"], ["nord10", "#5e81ac"]] },
		{ name : "Aurora", colors : [["nord11", "#bf616a"], ["nord12", "#d08770"], ["nord13", "#ebcb8b"], ["nord14", "#a3be8c"], ["nord15", "#b48ead"]] },
		{ name : "Classic", colors : [["Black", "#000000"], ["White", "#ffffff"]] }
	];
	var aOpen = [];

	function make(sTag, sClass, sText) {
		var el = document.createElement(sTag);
		if (sClass) el.className = sClass;
		if (sText) el.textContent = sText;
		return el;
	}

	/**
	 * @constructor
	 * @param {HTMLInputElement} elInput an <input type="color">
	 * @param {Object} [vOption]
	 * @param {String} [vOption.label] accessible name, e.g. "Code colour"
	 */
	NordPicker = function (elInput, vOption) {
		var self = this;
		var sLabel = (vOption && vOption.label) || "Colour";

		this._input = elInput;
		this._label = sLabel;

		// Keep the native input for "More colours", but out of sight and out of the tab order
		this._wrap = make("span", "nord-picker-wrap");
		elInput.parentNode.insertBefore(this._wrap, elInput);
		this._wrap.appendChild(elInput);
		elInput.classList.add("nord-picker-native");
		elInput.tabIndex = -1;
		elInput.setAttribute("aria-hidden", "true");

		this._trigger = make("button", "nord-picker-trigger");
		this._trigger.type = "button";
		this._trigger.setAttribute("aria-haspopup", "dialog");
		this._trigger.setAttribute("aria-expanded", "false");
		this._wrap.appendChild(this._trigger);

		this._panel = make("div", "nord-picker");
		this._panel.setAttribute("role", "dialog");
		this._panel.setAttribute("aria-label", sLabel);
		this._panel.hidden = true;
		this._wrap.appendChild(this._panel);

		this._swatches = [];
		PALETTE.forEach(function (oGroup) {
			var elGroup = make("div", "nord-picker-group");
			var elRow = make("div", "nord-picker-row");

			elGroup.appendChild(make("span", "nord-picker-name", oGroup.name));
			oGroup.colors.forEach(function (aColor) {
				var elSwatch = make("button", "nord-picker-swatch");
				elSwatch.type = "button";
				elSwatch.style.setProperty("--swatch", aColor[1]);
				elSwatch.title = aColor[0] + " " + aColor[1];
				elSwatch.setAttribute("aria-label", aColor[0] + ", " + aColor[1]);
				elSwatch.setAttribute("data-color", aColor[1]);
				elSwatch.addEventListener("click", function () {
					self._set(aColor[1]);
					self.close(true);
				});
				elRow.appendChild(elSwatch);
				self._swatches.push(elSwatch);
			});
			elGroup.appendChild(elRow);
			self._panel.appendChild(elGroup);
		});

		var elCustom = make("div", "nord-picker-custom");
		this._hex = make("input", "nord-picker-hex");
		this._hex.type = "text";
		this._hex.maxLength = 7;
		this._hex.spellcheck = false;
		this._hex.setAttribute("aria-label", sLabel + " hex value");
		var elMore = make("button", "nord-picker-more", "More colours…");
		elMore.type = "button";
		elCustom.appendChild(this._hex);
		elCustom.appendChild(elMore);
		this._panel.appendChild(elCustom);

		this._trigger.addEventListener("click", function () {
			if (self._panel.hidden) self.open();
			else self.close(true);
		});
		this._hex.addEventListener("keydown", function (e) {
			if (e.key === "Enter") {
				e.preventDefault();
				if (self._applyHex()) self.close(true);
			}
		});
		this._hex.addEventListener("change", function () { self._applyHex(); });
		elMore.addEventListener("click", function () {
			self.close(false);
			// The browser's own picker; its look comes from the browser and OS
			if (typeof elInput.showPicker == "function") {
				try {
					elInput.showPicker();
					return;
				} catch (err) {}
			}
			elInput.click();
		});
		this._panel.addEventListener("keydown", function (e) {
			if (e.key === "Escape") {
				e.stopPropagation();
				self.close(true);
			}
		});
		// The native picker (or browser form restore) can change the value too
		elInput.addEventListener("input", function () { self._sync(); });
		elInput.addEventListener("change", function () { self._sync(); });

		this._sync();
	};

	NordPicker.prototype.open = function () {
		var self = this;

		aOpen.slice().forEach(function (oPicker) { oPicker.close(false); });
		this._sync();
		this._panel.hidden = false;
		this._panel.style.left = "";
		this._trigger.setAttribute("aria-expanded", "true");
		aOpen.push(this);

		// Keep the panel on screen on narrow layouts
		var oRect = this._panel.getBoundingClientRect();
		var nOver = oRect.right - (document.documentElement.clientWidth - 8);
		if (nOver > 0) this._panel.style.left = -nOver + "px";

		(this._panel.querySelector('[aria-pressed="true"]') || this._swatches[0]).focus();

		this._onOutside = function (e) {
			if (!self._wrap.contains(e.target)) self.close(false);
		};
		document.addEventListener("pointerdown", this._onOutside);
	};

	/**
	 * @param {Boolean} bReturnFocus put focus back on the swatch button
	 */
	NordPicker.prototype.close = function (bReturnFocus) {
		if (this._panel.hidden) return;
		this._panel.hidden = true;
		this._trigger.setAttribute("aria-expanded", "false");
		aOpen.splice(aOpen.indexOf(this), 1);
		document.removeEventListener("pointerdown", this._onOutside);
		if (bReturnFocus) this._trigger.focus();
	};

	NordPicker.prototype._set = function (sColor) {
		this._input.value = sColor;
		this._input.dispatchEvent(new Event("input", { bubbles : true }));
	};

	NordPicker.prototype._applyHex = function () {
		// Accept "fff", "#fff", "ffffff" and "#ffffff"
		var sValue = this._hex.value.trim().toLowerCase().replace(/^#/, "");

		if (/^[0-9a-f]{3}$/.test(sValue)) sValue = sValue[0] + sValue[0] + sValue[1] + sValue[1] + sValue[2] + sValue[2];

		if (!/^[0-9a-f]{6}$/.test(sValue)) {
			this._hex.classList.add("is-invalid");
			return false;
		}

		this._hex.classList.remove("is-invalid");
		this._set("#" + sValue);
		return true;
	};

	// Show the input's current colour on the button, the hex field and the palette
	NordPicker.prototype._sync = function () {
		var sValue = this._input.value.toLowerCase();

		this._trigger.style.setProperty("--swatch", sValue);
		this._trigger.setAttribute("aria-label", this._label + ", " + sValue);
		this._hex.value = sValue;
		this._hex.classList.remove("is-invalid");
		this._swatches.forEach(function (elSwatch) {
			elSwatch.setAttribute("aria-pressed", elSwatch.getAttribute("data-color") === sValue ? "true" : "false");
		});
	};
})();
