/*
 * Builds downloadable PNG and SVG files of a QR code, including the light
 * border (quiet zone) that scanners need around the code. Needs qrcode.js.
 * Pass the same options as the code on screen and the files match it,
 * colours, logo and rounded corners included.
 *
 * @example
 * QRExport.png({ text : "https://example.com", logo : elImage, cornerRadius : 0.05 }).then(function (oBlob) {
 *    QRExport.download(oBlob, "qr-code.png");
 * });
 */
var QRExport = (function () {
	var XLINK_NS = "http://www.w3.org/1999/xlink";
	var QUIET_ZONE = 4; // modules of light border, as the QR spec asks
	var TARGET_SIZE = 1024; // pixels for PNG, and the default size of the SVG

	/**
	 * Make a detached code with the given options
	 *
	 * @private
	 * @param {Object} htOption QRCode options; text is required
	 * @param {Boolean} bSVG
	 * @param {Number} nSize CSS pixel size of the whole image, quiet zone included
	 */
	function make(htOption, bSVG, nSize) {
		var el = document.createElement("div");
		var oOption = {};

		for (var k in htOption) oOption[k] = htOption[k];
		oOption.width = nSize;
		oOption.height = nSize;
		oOption.useSVG = bSVG;
		oOption.quietZone = QUIET_ZONE;

		return { el : el, qrcode : new QRCode(el, oOption) };
	}

	/**
	 * @param {Object} htOption QRCode options; text is required
	 * @return {Promise<Blob>} a PNG about TARGET_SIZE pixels square
	 */
	function png(htOption) {
		return new Promise(function (resolve, reject) {
			// Size every module to a whole number of pixels so edges stay crisp
			var nCount = make(htOption, true, TARGET_SIZE).qrcode.getModuleCount();
			var nTotal = Math.max(1, Math.floor(TARGET_SIZE / (nCount + 2 * QUIET_ZONE))) * (nCount + 2 * QUIET_ZONE);
			// The canvas drawer scales by devicePixelRatio; undo that so it renders nTotal pixels exactly
			var elCanvas = make(htOption, false, nTotal / (window.devicePixelRatio || 1)).el.querySelector("canvas");

			elCanvas.toBlob(function (oBlob) {
				if (oBlob) {
					resolve(oBlob);
				} else {
					reject(new Error("PNG export failed"));
				}
			}, "image/png");
		});
	}

	/**
	 * @param {Object} htOption QRCode options; text is required
	 * @return {Promise<Blob>} a standalone SVG file; any logo is embedded in it
	 */
	function svg(htOption) {
		var elSVG = make(htOption, true, TARGET_SIZE).el.querySelector("svg");
		var aImages = elSVG.querySelectorAll("image");

		elSVG.setAttribute("width", TARGET_SIZE);
		elSVG.setAttribute("height", TARGET_SIZE);

		// Older SVG editors only understand xlink:href
		for (var i = 0; i < aImages.length; i++) {
			aImages[i].setAttributeNS(XLINK_NS, "xlink:href", aImages[i].getAttribute("href"));
		}

		var sFile = '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(elSVG);

		return Promise.resolve(new Blob([sFile], { type : "image/svg+xml" }));
	}

	/**
	 * Save a Blob through the browser's normal download
	 *
	 * @param {Blob} oBlob
	 * @param {String} sName file name
	 */
	function download(oBlob, sName) {
		var sURL = URL.createObjectURL(oBlob);
		var elLink = document.createElement("a");

		elLink.href = sURL;
		elLink.download = sName;
		document.body.appendChild(elLink);
		elLink.click();
		elLink.remove();
		setTimeout(function () { URL.revokeObjectURL(sURL); }, 1000);
	}

	return { QUIET_ZONE : QUIET_ZONE, png : png, svg : svg, download : download };
})();
