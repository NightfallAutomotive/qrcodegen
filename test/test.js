// Usage: node test/test.js <qrcode.js|qrcode.min.js>
// Generates codes in a stubbed DOM, decodes them with jsQR and checks the bytes round-trip.
var fs = require('fs');
var vm = require('vm');
var jsQR = require('jsqr');

function load(file) {
	var ctx2d = {
		calls: [],
		fillRect: function () {}, clearRect: function () {}, beginPath: function () {}, fill: function () {},
		roundRect: function () { this.calls.push(['roundRect'].concat([].slice.call(arguments))); },
		drawImage: function () { this.calls.push(['drawImage'].concat([].slice.call(arguments, 1))); }
	};
	mkEl.renders = 0;
	function mkEl(tag) {
		return {
			tagName: tag, style: {}, childNodes: [], attrs: {},
			appendChild: function (c) { this.childNodes.push(c); return c; },
			hasChildNodes: function () { return this.childNodes.length > 0; },
			removeChild: function (c) { this.childNodes.splice(this.childNodes.indexOf(c), 1); },
			get lastChild() { return this.childNodes[this.childNodes.length - 1]; },
			setAttribute: function (k, v) { this.attrs[k] = v; },
			getContext: function () { return ctx2d; },
			toDataURL: function () { return 'data:image/png;base64,' + (++mkEl.renders); }
		};
	}
	var sandbox = {
		window: { devicePixelRatio: 2 },
		document: {
			documentElement: { tagName: 'HTML' },
			createElement: mkEl,
			createElementNS: function (ns, tag) { return mkEl(tag); },
			getElementById: function () { return mkEl('div'); }
		}
	};
	vm.createContext(sandbox);
	vm.runInContext(fs.readFileSync(file, 'utf8') + '\n;this.__QR = QRCode;', sandbox);
	return { QRCode: sandbox.__QR, mkEl: mkEl, ctx2d: ctx2d };
}

function decode(model) {
	var n = model.getModuleCount(), quiet = 4, scale = 4, size = (n + 2 * quiet) * scale;
	var px = new Uint8ClampedArray(size * size * 4).fill(255);
	for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (model.isDark(r, c)) {
		for (var y = 0; y < scale; y++) for (var x = 0; x < scale; x++) {
			var i = (((r + quiet) * scale + y) * size + (c + quiet) * scale + x) * 4;
			px[i] = px[i + 1] = px[i + 2] = 0;
		}
	}
	return jsQR(px, size, size);
}

var lib = load(process.argv[2]);
var QRCode = lib.QRCode, mkEl = lib.mkEl, ctx2d = lib.ctx2d;
var failures = 0;
function check(cond, msg) {
	if (!cond) {
		failures++;
		console.log('FAIL ' + msg);
	}
}

var inputs = ['a', 'hello world', 'https://github.com/NightfallAutomotive/qrcodegen',
	'\u0080', 'é ü ß', '漢字かな한국어', '😀 emoji 🚗', 'mixed: a€😀߿ࠀ￿',
	'x'.repeat(1200), '😀'.repeat(100)];

['L', 'M', 'Q', 'H'].forEach(function (level) {
	inputs.forEach(function (text) {
		var label = level + ' "' + text.slice(0, 20) + '"';
		var q = new QRCode(mkEl('div'), { text: text, correctLevel: QRCode.CorrectLevel[level] });
		var result = decode(q._oQRCode);
		check(result, label + ' did not decode');
		if (result) check(Buffer.from(result.binaryData).equals(Buffer.from(text, 'utf8')), label + ' bytes differ');
	});
});

// Version 40-H holds 1273 bytes; one more must throw the intended error
try {
	new QRCode(mkEl('div'), { text: 'x'.repeat(1273) });
} catch (e) {
	check(false, 'max length threw ' + e.message);
}
try {
	new QRCode(mkEl('div'), { text: 'x'.repeat(1274) });
	check(false, 'overflow did not throw');
} catch (e) {
	check(e.message === 'Too long data', 'overflow threw ' + e.message);
}

// useSVG must not leak into later instances, and SVG output must not rely on ids
var svgCode = new QRCode(mkEl('g'), { text: 'a', useSVG: true });
var elCanvas = mkEl('div');
new QRCode(elCanvas, { text: 'b' });
var svg = svgCode._el.childNodes[0];
check(svg.tagName === 'svg', 'useSVG instance drew ' + svg.tagName);
check(elCanvas.childNodes[0].tagName === 'canvas', 'later instance drew ' + elCanvas.childNodes[0].tagName);
check(svg.childNodes.every(function (k) { return !k.attrs.id; }), 'SVG output uses ids');

// Canvas renders at devicePixelRatio but displays at the requested size
var elHiDPI = mkEl('div');
var hiDPI = new QRCode(elHiDPI, { text: 'c', width: 100, height: 100 });
var canvas = elHiDPI.childNodes[0], img = elHiDPI.childNodes[1];
check(canvas.width === 200 && canvas.style.width === '100px', 'canvas not scaled for HiDPI');
check(img.style.display === 'block' && img.style.width === '100px', 'image not shown at CSS size');
hiDPI.clear();
check(img.style.display === 'none', 'clear() left the image visible');

// Logo is drawn centred on a plate, keeps its aspect ratio, and can be removed
var logo = { src: 'data:image/png;base64,AAAA', naturalWidth: 200, naturalHeight: 100 };
var elLogoCode = mkEl('div');
var logoCode = new QRCode(elLogoCode, { text: 'logo', width: 100, height: 100 });
var src = elLogoCode.childNodes[1].src;
ctx2d.calls = [];
logoCode.setLogo(logo);
var plate = ctx2d.calls.filter(function (c) { return c[0] === 'roundRect'; })[0];
var drawn = ctx2d.calls.filter(function (c) { return c[0] === 'drawImage'; })[0];
check(plate && plate[3] === 44 && plate[1] === 78, 'logo plate not centred at 22% of the 200px canvas: ' + plate);
check(drawn && Math.abs(drawn[3] / drawn[4] - 2) < 1e-9, 'logo aspect ratio not kept: ' + drawn);
check(drawn && Math.abs(drawn[1] + drawn[3] / 2 - 100) < 1e-9 && Math.abs(drawn[2] + drawn[4] / 2 - 100) < 1e-9, 'logo not centred: ' + drawn);
check(elLogoCode.childNodes[1].src !== src, 'setLogo did not refresh the image');
ctx2d.calls = [];
logoCode.setLogo(null);
check(ctx2d.calls.length === 0, 'logo still drawn after setLogo(null)');

var svgLogo = new QRCode(mkEl('g'), { text: 'logo', useSVG: true, logo: logo });
var svgParts = svgLogo._el.childNodes[0].childNodes;
check(svgParts.some(function (k) { return k.tagName === 'image' && k.attrs.href === logo.src; }), 'SVG output has no logo image');

console.log(failures ? failures + ' failure(s)' : 'all tests passed (' + process.argv[2] + ')');
process.exit(failures ? 1 : 0);
