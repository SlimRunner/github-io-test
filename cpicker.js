(function() {
  'use strict';

  window.addEventListener("load", (evt) => {
    
    initColorPicker();

    loadUIListeners();
    loadColorPickerListeners();
    updateColorPreview();
  });

  function loadUIListeners() {
    const colorButton = document.getElementById("colorButton");

    colorButton.addEventListener("click", (evt) => {
      CPicker.show(
        getHSVpack(currentColor()),
        colorButton
      );
    });
  
    colorButton.addEventListener("pickerChange", (evt) => {
      if (
        evt.detail.action === DialogResult.OK &&
        evt.detail.changed()
      ) {
        let color = evt.detail.value.getCSSRGBA();
        currentColor(true, color);
        updateColorPreview();
      }
    });
  }

  // sets the color preview on contex menu button
	function updateColorPreview() {
    const colorButton = document.getElementById("colorButton");
    const colorButtonPreview = document.getElementById("colorButtonPreview");

		if (colorButton.style.display === 'none') return;
		let [r, g, b, al = 1] = getRGBpack(
			currentColor()
		).map((n, i) => {
			if (i !== 3) return Math.round(n * 255);
			else return n;
		});
		colorButtonPreview.style.background = (
			`linear-gradient(-45deg,rgba(${r},${g},${b}) 49%,rgba(${r},${g},${b},${al}) 51%)`
		);
	}
  
  // radians to degrees ratio
	const RAD_TO_DEG = 180 / Math.PI;
	
	// canvas properties
	const CANV_SIZE = 256;
	const CANV_MID = CANV_SIZE / 2;
	
	// color wheel properties
	const TRIAG_RAD = CANV_SIZE * 45 / 128; // 90:256
	const WHEEL_RAD_OUT = CANV_MID; // 2:256
	const WHEEL_RAD_IN = CANV_SIZE * 53 / 128; // 106:256
	const MARK_SIZE = 6;

  // type of result from color picker
	const ColorResType = Object.freeze({
		SINGLE_COLOR : 0,
		MULTIPLE_COLORS : 1,
		TOGGLE_LIVE: 2
	});

  // dialog result values
	const DialogResult = Object.freeze({
		None: 0,
		OK : 1,
		Cancel : 2
	});

  // creates an error with custom name
	class CustomError extends Error {
		/* Source
		* https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error
		*/
		constructor(name, ...params) {
			// Pass remaining arguments (including vendor specific ones) to parent constructor
			super(...params);

			// Maintains proper stack trace for where our error was thrown (only available on V8)
			if (Error.captureStackTrace) {
				Error.captureStackTrace(this, CustomError);
			}
				
			this.name = name;
		}
	}

  // Color class for the HSV color picker
	class HSVColor {
		constructor(hue, sat, value, alpha = 1) {
			this.hue = hue;
			this.saturation = sat;
			this.value = value;
			this.alpha = alpha;
		}
		
		get HSV() {
			return [this.hue, this.saturation, this.value, this.alpha];
		}
		
		get RGB() {
			return getRGBfromHSV(
				this.hue, this.saturation, this.value
			).concat(this.alpha);
		}
		
		getCSSRGBA() {
			let rgb = getRGBfromHSV(
				this.hue,
				this.saturation,
				this.value
			).map((n) => {
				return Math.round(n * 255);
			});
			
			if (this.alpha === 1) {
				return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
			}
			
			return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${this.alpha})`;
		}
		
		getHexRGBA() {
			let hexCodes = getRGBfromHSV(
				this.hue, this.saturation, this.value
			).map((n) => {
				let strOut = Math.round(n * 255).toString(16);
				if (strOut.length === 1) strOut = '0' + strOut;
				return strOut;
			});
			
			if (this.alpha < 1) {
        const alphaSlider = document.getElementById("alphaSlider");
				let strOut = Math.round(alphaSlider.value * 255).toString(16);
				if (strOut.length === 1) strOut = '0' + strOut;
				hexCodes.push(strOut);
			}
			
			return '#' + hexCodes.join('');
		}
		
		setHSV(hue, sat, value, alpha = 1) {
			this.hue = hue;
			this.saturation = sat;
			this.value = value;
			this.alpha = alpha;
		}
		
		setRGB(red, green, blue, alpha = 1) {
			[
				this.hue,
				this.saturation,
				this.value,
				this.alpha = alpha
			] = getHSVfromRGB(red, green, blue);
		}
		
		static isEqual(lhs, rhs) {
			return (
				lhs.hue === rhs.hue &&
				lhs.saturation === rhs.saturation &&
				lhs.value === rhs.value &&
				lhs.alpha === rhs.alpha
			);
		}
	}
  
  // stores the state of the color picker
	const CPicker = Object.assign({}, {
		show: showColorWheel,
		hide: hideColorWheel,
		onChange: null,
		dispatcher: null,
		pickerImage: null,
		canvasOffset: null,
		triangle: null,
		
		markers: {
			active: null,
			hue: [],
			satv: []
		},
		
		result: {
			value: null, // HSVColor
			initValue: null, // HSVColor
			type: ColorResType.SINGLE_COLOR,
			action: DialogResult.None,
			changed: function () {
				return !(
					typeof this.value === typeof this.initValue &&
					Array.isArray(this.value) ?
					false: // implementation pending
					HSVColor.isEqual(this.value, this.initValue)
				);
			},
		}
	});

  // CPicker method definition that shows the color picker
	function showColorWheel(hsvPack, dispatcher) {
		initMarkers();
    const backShade = document.getElementById("backShade");
    const colorWheel = document.getElementById("colorWheel");
    const alphaSlider = document.getElementById("alphaSlider");
		CPicker.dispatcher = dispatcher;
		CPicker.result.value = new HSVColor(...hsvPack);
		CPicker.result.initValue = new HSVColor(...hsvPack);
		
		alphaSlider.value = CPicker.result.value.alpha;
		updateAlphaInput();
		setHueMarkerByAngle(0, CPicker.result.value.hue);
		CPicker.triangle = updateColorWheel(CPicker.markers.hue[0].angle);
		setSatValMarkerByNumber(0, CPicker.result.value.saturation, CPicker.result.value.value, CPicker.triangle);
		drawMarkers();
		updateTextInputs();
		
		backShade.classList.add('sli-page-shade-show');
		
		// focus the color wheel when loading in
		setTimeout(()=>colorWheel.focus(), 50);
		// for some reason it cannot be:
		// ctrPicker.colorWheel.focus();
	}
	
	// CPicker method definition that hides the color picker
	function hideColorWheel() {
    const backShade = document.getElementById("backShade");
    const alphaSlider = document.getElementById("alphaSlider");
		backShade.classList.remove('sli-page-shade-show');
		
		CPicker.result.value.setHSV(
			CPicker.markers.hue[0].angle,
			CPicker.markers.satv[0].sat,
			CPicker.markers.satv[0].val,
			alphaSlider.value
		);
		CPicker.dispatcher.dispatchEvent(CPicker.onChange);
	}

  // updates the color text inputs
	function updateTextInputs() {
    const alphaSlider = document.getElementById("alphaSlider");
    const hexInput = document.getElementById("hexInput");
    const hueInput = document.getElementById("hueInput");
    const satInput = document.getElementById("satInput");
    const valInput = document.getElementById("valInput");
		let hsvCol = new HSVColor (
			CPicker.markers.hue[0].angle,
			CPicker.markers.satv[0].sat,
			CPicker.markers.satv[0].val,
			alphaSlider.value
		);
		
		hexInput.value = hsvCol.getHexRGBA();
		hueInput.value = getCoterminalAngle(hsvCol.hue).toFixed();
		satInput.value = (hsvCol.saturation * 100).toFixed();
		valInput.value = (hsvCol.value * 100).toFixed();
	}
	
	// updates the alpha text input
	function updateAlphaInput() {
    const alphaSlider = document.getElementById("alphaSlider");
    const alphaInput = document.getElementById("alphaInput");
    const hexInput = document.getElementById("hexInput");
		let hsvCol = new HSVColor (
			CPicker.markers.hue[0].angle,
			CPicker.markers.satv[0].sat,
			CPicker.markers.satv[0].val,
			alphaSlider.value
		);
		
		hexInput.value = hsvCol.getHexRGBA();
		alphaInput.value = (
			alphaSlider.value * 100
		).toFixed();
	}

  function initColorPicker() {
    const colorWheel = document.getElementById("colorWheel");
    let ctx = colorWheel.getContext("2d");
		// get canvas size
		let ctxBBox = {
			width: colorWheel.clientWidth,
			height: colorWheel.clientHeight
		};
		// get border offset of canvas
		CPicker.canvasOffset = {
			x: colorWheel.clientLeft,
			y: colorWheel.clientTop
		};
		// create an empty image for canvas
		CPicker.pickerImage = ctx.createImageData(
			ctxBBox.width, ctxBBox.height
		);
		// draw rainbow ring on canvas image
		getRainbowRing(
			CPicker.pickerImage.data,
			Math.floor(ctxBBox.width)
		);
		
		// adds custom event (to the global object?)
		CPicker.onChange = new CustomEvent('pickerChange', {detail: CPicker.result});
  }

  // adds events listeners of the color picker
	function loadColorPickerListeners() {
		const RGX_HEX_KEY = /^[0-9a-f]$|^#$/i;
		const RGX_NUM_KEY = /^\d$/;
		const RGX_NAMED_KEY = /.{2,}/i;
		
    const backShade = document.getElementById("backShade");
    const colorWheel = document.getElementById("colorWheel");
    const alphaSlider = document.getElementById("alphaSlider");
    const dialOk = document.getElementById("pickerOK");
    const dialCancel = document.getElementById("pickerCancel");
    const hexInput = document.getElementById("hexInput");
    const hueInput = document.getElementById("hueInput");
    const satInput = document.getElementById("satInput");
    const valInput = document.getElementById("valInput");

		// when true prevents the dialog from closing
		let exitClick = false;
		
		// Release click on gray area
		backShade.addEventListener('mousedown', (e) => {
			if (e.currentTarget.isSameNode(e.target)) {
				exitClick = true;
			} else {
				exitClick = false;
			}
		});
		
		// Release click on gray area
		backShade.addEventListener('mouseup', (e) => {
			if (e.currentTarget.isSameNode(e.target) && exitClick) {
				CPicker.result.action = DialogResult.OK;
				CPicker.hide();
			} else {
				// nothing to do (DO NOT FOCUS)
			}
		});
		
		// prevent keyboard shortcuts from reaching Desmos GUI
		backShade.addEventListener('keydown', (e) => {
			let keyIn = e.key.toLowerCase();
			
			switch (true) {
				case keyIn === 'enter':
					CPicker.result.action = DialogResult.OK;
					CPicker.hide();
					break;
				case keyIn === 'escape':
					CPicker.result.action = DialogResult.Cancel;
					CPicker.hide();
					break;
				default:
					// Nothing to do
			}
			
			e.stopPropagation();
			return false;
		});
		
		// prevent keyboard shortcuts from reaching Desmos GUI
		backShade.addEventListener('keyup', (e) => {
			e.stopPropagation();
			return false;
		});
		
		// prevent the focus from going rogue
		backShade.addEventListener('focus', (e) => {
			colorWheel.focus();
		});
		
		// triggers when the alpha slider has been changed
		alphaSlider.addEventListener('change', updateAlphaInput);
		
		// triggers each time the alpha slider is changed
		alphaSlider.addEventListener('input', updateAlphaInput);
		
		// Ok dialog button
		dialOk.addEventListener('click', () => {
			CPicker.result.action = DialogResult.OK;
			CPicker.hide();
		});
		
		// Cancel dialog button
		dialCancel.addEventListener('click', () => {
			CPicker.result.action = DialogResult.Cancel;
			CPicker.hide();
		});
		
		// tidies up format of the hex color
		hexInput.addEventListener('change', (e) => {
			updateHexInput();
		});
		
		// tidies up format of the hex color
		hueInput.addEventListener('change', (e) => {
			const RGX_5_DIGITS = /^\d{1,5}$/i;
			let hueText = hueInput.value.trim();
			let h;
			
			if (RGX_5_DIGITS.test(hueText)) {
				h = parseInt(hueText);
			} else {
				h = CPicker.marker.hue[0].angle;
			}
			
			hueInput.value = getCoterminalAngle(h).toFixed();
		});
		
		// tidies up format of the hex color
		bindListenerToNodes([
			satInput,
			valInput,
			alphaInput
		], 'change', (e) => {
			const RGX_3_DIGITS = /^\d{1,3}$/i;
			let thisText = e.target.value.trim();
			let thisVal;
			
			if (RGX_3_DIGITS.test(thisText)) {
				thisVal = minmax(parseInt(thisText), 0, 100);
			} else {
				switch (true) {
					case e.target.isSameNode(satInput):
						thisVal = CPicker.markers.satv[0].sat * 100;
						break;
					case e.target.isSameNode(valInput):
						thisVal = CPicker.markers.satv[0].val * 100;
						break;
					case e.target.isSameNode(alphaInput):
						thisVal = alphaSlider.value * 100;
						break;
					default:
						thisVal = 0;
				}
			}
			
			e.target.value = (thisVal).toFixed();
		});
		
		// updates all color values with the hex color code
		hexInput.addEventListener('input', (e) => {
			const RGX_HEX_STRING = /^#?(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
			let hexText = hexInput.value.trim();
			
			if (RGX_HEX_STRING.test(hexText)) {
				hexText = (hexText.indexOf('#') !== -1? '' : '#' ) + hexText;
				
				let [r, g, b, a = 1] = parseCSSHex(hexText, true);
				let [h, s, v] = getHSVfromRGB(r, g, b);
				
				alphaSlider.value = a;
				setHueMarkerByAngle(0, h);
				CPicker.triangle = updateColorWheel(CPicker.markers.hue[0].angle);
				setSatValMarkerByNumber(0, s, v, CPicker.triangle);
				drawMarkers();
				
				hueInput.value = getCoterminalAngle(h, 360).toFixed();
				satInput.value = (s * 100).toFixed();
				valInput.value = (v * 100).toFixed();
				alphaInput.value = (a * 100).toFixed();
			} else {
				// not a valid color
			}
		});
		
		//
		hueInput.addEventListener('input', (e) => {
			const RGX_5_DIGITS = /^\d{1,5}$/i;
			let hueText = hueInput.value.trim();
			
			if (RGX_5_DIGITS.test(hueText)) {
				let h = parseInt(hueText);
				
				setHueMarkerByAngle(0, h);
				CPicker.triangle = updateColorWheel(CPicker.markers.hue[0].angle);
				setSatValMarkerByNumber(
					0,
					CPicker.markers.satv[0].sat,
					CPicker.markers.satv[0].val,
					CPicker.triangle
				);
				drawMarkers();
				
				updateHexInput();
			} else {
				// not a valid color
			}
		});
		
		//
		bindListenerToNodes([
			satInput,
			valInput
		], 'input', (e) => {
			const RGX_3_DIGITS = /^\d{1,3}$/i;
			let satvalText = e.target.value.trim();
			
			if (
				RGX_3_DIGITS.test(satvalText)
			) {
				let s = minmax(parseFloat(
					satInput.value.trim()
				), 0, 100) / 100;
				let v = minmax(parseFloat(
					valInput.value.trim()
				), 0, 100) / 100;
				
				setHueMarkerByAngle(0, CPicker.markers.hue[0].angle);
				CPicker.triangle = updateColorWheel(CPicker.markers.hue[0].angle);
				setSatValMarkerByNumber(0, s, v, CPicker.triangle);
				drawMarkers();
				
				updateHexInput();
			} else {
				// not a valid color
			}
		});
		
		//
		alphaInput.addEventListener('input', (e) => {
			const RGX_3_DIGITS = /^\d{1,3}$/i;
			let alphaText = alphaInput.value.trim();
			
			if (
				RGX_3_DIGITS.test(alphaText)
			) {
				let a = minmax(parseFloat(
					alphaInput.value.trim()
				), 0, 100) / 100;
				
				alphaSlider.value = a;
				updateHexInput();
			} else {
				// not a valid color
			}
		});
		
		// filter alphanumeric input for hex values
		hexInput.addEventListener('keydown', (e) => {
			if (
				!RGX_NAMED_KEY.test(e.key) &&
				!e.altKey && !e.ctrlKey &&
				!RGX_HEX_KEY.test(e.key)
			) {
				// cancels the input of non-valid characters
				// but allows keyboard shortcuts and named special keys
				e.preventDefault();
				return false;
			}
		});
		
		// prevents pasting invalid values in hex color
		hexInput.addEventListener('paste', (e) => {
			const RGX_HEX_STRING = /^#?(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
			let inText = e.clipboardData.getData('text/plain');
			
			if (RGX_HEX_STRING.test(inText)) {
				hexInput.value = "";
			} else {
				e.preventDefault();
				return false;
			}
		});
		
		// prevent pasting invalid values in hue
		hueInput.addEventListener('paste', (e) => {
			const RGX_5_DIGITS = /^\d{1,5}$/i;
			let inText = e.clipboardData.getData('text/plain');
			
			if (RGX_5_DIGITS.test(inText)) {
				hueInput.value = "";
			} else {
				e.preventDefault();
				return false;
			}
		});
		
		// prevent pasting invalid values in 3-digit fields
		bindListenerToNodes([
			satInput,
			valInput,
			alphaInput
		], 'paste', (e) => {
			const RGX_3_DIGITS = /^\d{1,3}$/i;
			let inText = e.clipboardData.getData('text/plain');
			
			if (RGX_3_DIGITS.test(inText)) {
				e.target.value = "";
			} else {
				e.preventDefault();
				return false;
			}
		});
		
		// filter numeric input for fields for color values
		bindListenerToNodes([
			hueInput,
			satInput,
			valInput,
			alphaInput
		], 'keydown', (e) => {
			if (
				!RGX_NAMED_KEY.test(e.key) &&
				!e.altKey && !e.ctrlKey &&
				!RGX_NUM_KEY.test(e.key)
			) {
				// cancels the input of non-valid characters
				// but allows keyboard shortcuts and named special keys
				e.preventDefault();
				return false;
			}
		});
		
		bindListenerToNodes([
			hexInput,
			hueInput,
			satInput,
			valInput,
			alphaInput
		], 'focus', (e) => {
			e.target.select();
		});
		
		// mouse button event of color picker
		colorWheel.addEventListener('mousedown', (e) => {
			if (e.buttons === 1) {
				let mse = getCanvasMse(colorWheel, e, CPicker.canvasOffset);
				
				if (!setMarkerByMouse(mse)) {
					fetchValidMarker(mse);
					setMarkerByMouse(mse);
				}
			}
		});
		
		// move event of color picker
		colorWheel.addEventListener('mousemove', (e) => {
			let mse = getCanvasMse(colorWheel, e, CPicker.canvasOffset);
			
			if (e.buttons === 0) {
				CPicker.markers.active = selectMarker(mse);
			} else if (e.buttons === 1) {
				setMarkerByMouse(mse);
			}
		});
		
		// finds a valid marker on canvas given a mouse location
		function fetchValidMarker(mse) {
			if (
				distance(mse, {x: CANV_MID, y: CANV_MID}) > WHEEL_RAD_IN
			) {
				CPicker.markers.active = {
					type: 'hue', id: 0
				};
			} else if (
				isInTriangle(mse, CPicker.triangle)
			) {
				CPicker.markers.active = {
					type: 'satv', id: 0
				};
			} else {
				return false;
			}
			
			return true;
		}
		
		// sets active marker with given mouse location
		function setMarkerByMouse(mse) {
			if (CPicker.markers.active === null) return false;
			
			switch (CPicker.markers.active.type) {
				case 'hue':
					setHueMarkerByMse(CPicker.markers.active.id, mse);
					CPicker.triangle = updateColorWheel(CPicker.markers.hue[0].angle);
					setSatValMarkerByNumber(
						CPicker.markers.active.id,
						CPicker.markers.satv[CPicker.markers.active.id].sat,
						CPicker.markers.satv[CPicker.markers.active.id].val,
						CPicker.triangle
					);
					drawMarkers();
					updateTextInputs();
					break;
				case 'satv':
					setSatValMarkerByMse(CPicker.markers.active.id, mse, CPicker.triangle);
					// this should not update CPicker.triangle ever
					updateColorWheel(CPicker.markers.hue[0].angle);
					drawMarkers();
					updateTextInputs();
					break;
				default:
					// throw; // ADD CUSTOM ERROR
			}
			
			return true;
		}
		
		// gets the mouse location of an element (including border)
		function getCanvasMse(canvas, evt, offset) {
			var rect = canvas.getBoundingClientRect();
			return {
				x: evt.clientX - rect.left - offset.x,
				y: evt.clientY - rect.top - offset.y
			};
		}
		
	}

  // updates color and alpha inputs
	function updateHexInput() {
    const alphaSlider = document.getElementById("alphaSlider");
    const hexInput = document.getElementById("hexInput");
		let hsvCol = new HSVColor (
			CPicker.markers.hue[0].angle,
			CPicker.markers.satv[0].sat,
			CPicker.markers.satv[0].val,
			alphaSlider.value
		);
		
		hexInput.value = hsvCol.getHexRGBA();
	}
	
	// renders the color wheel onto the canvas
	function updateColorWheel(angle) {
    const colorWheel = document.getElementById("colorWheel");
		let ctx = colorWheel.getContext("2d");
		
		// draws image data onto the canvas
		ctx.putImageData(CPicker.pickerImage, 0, 0);
		
		let shadowPat = ctx.createRadialGradient(
			CANV_MID,			// from x
			CANV_MID,			// from y
			0,						// from radius
			CANV_MID,			// to x
			CANV_MID,			// to y
			WHEEL_RAD_IN	// to radius
		);
		shadowPat.addColorStop(0, '#444');
		shadowPat.addColorStop(0.9, '#333');
		shadowPat.addColorStop(1, '#111');
		ctx.fillStyle = shadowPat;
		
		ctx.beginPath();
		ctx.arc(
			CANV_MID,			// center x
			CANV_MID,			// center y
			WHEEL_RAD_IN,	// arc radius
			0,						// from angle
			Math.PI*2			// to angle
		);
		ctx.closePath();
		ctx.fill();
		
		let triagColor = getRGBfromHSV(
			angle, 1, 1
		).map(
			item => item * 255
		);
		
		let triData = drawTriangle(ctx, angle / RAD_TO_DEG, triagColor);
		
		return triData;
	}
  
  // generates data image of a chromatic circle
	function getRainbowRing(img, wdt) {
		let x, y;
		let pix;
		
		for (let i = 0; i < img.length; i += 4) {
			/*jshint bitwise: false */
			x = (i/4) % wdt - CANV_MID;
			// pipe used to convert operation to integer
			y = ((i/4) / wdt|0) - CANV_MID;
			/*jshint bitwise: true */
			
			pix = getRGBfromHSV(
				Math.atan2(-y, x)*RAD_TO_DEG, 1, 1
			).map(
				item => item * 255
			);
			
			img[i] = pix[0];
			img[i + 1] = pix[1];
			img[i + 2] = pix[2];
			img[i + 3] = 255;
		} // !for
	}

  function currentColor(isSetter = false, color = "#fff") {
    if (!currentColor.hasOwnProperty("thisColor")) {
      currentColor.thisColor = color;
    }
    if (isSetter) {
      currentColor.thisColor = color;
    }
    return currentColor.thisColor;
  }

  // draws SV triangle to context and returns vertex data of triangle
	function drawTriangle(ctx, angle, color) {
		let triAngles = [
			angle,
			2.0943951023931953 + angle,
			4.1887902047863905 + angle
		];
		let midAngles = [
			1.0471975511965976 + angle,
			3.141592653589793 + angle,
			5.235987755982988 + angle
		];
		let arrowDisp = {
			x: 0.1 * Math.cos(angle),
			y: 0.1 * -Math.sin(angle)
		};
		let colSolid = `rgba(${color[0]},${color[1]},${color[2]},1)`;
		let triangle = [0, 0, 0], midTri = [0, 0, 0];
		
		for (var i = 0; i < triangle.length; ++i) {
			
			triangle[i] = {
				x: Math.cos(triAngles[i]),
				y: -Math.sin(triAngles[i])
			};
			
			midTri[i] = {
				x: 0.5 * Math.cos(midAngles[i]),
				y: 0.5 * -Math.sin(midAngles[i])
			};
			
		}
		
		let arrow = [1, 0, 2].map((idx) => {
			return {
				x: 0.9 * triangle[0].x + 0.1 * triangle[idx].x + arrowDisp.x,
				y: 0.9 * triangle[0].y + 0.1 * triangle[idx].y + arrowDisp.y
			};
		});
		
		ctx.save();
		
		ctx.transform(
			TRIAG_RAD,	// x-scale
			0,					// x-skew
			0,					// y-skew
			TRIAG_RAD,	// y-scale
			CANV_MID,		// x-trans
			CANV_MID		// y-trans
		);
		
		// gradient from input color to black
		let colorGrad = ctx.createLinearGradient(
			triangle[0].x,	// from x
			triangle[0].y,	// from y
			midTri[1].x,		// to x
			midTri[1].y			// to y
		);
		colorGrad.addColorStop(0, colSolid);
		colorGrad.addColorStop(1, 'black');
		
		// gradient from black to white
		let blackGrad = ctx.createLinearGradient(
			midTri[0].x,		// from x
			midTri[0].y,		// from y
			triangle[2].x,	// to x
			triangle[2].y		// to y
		);
		blackGrad.addColorStop(0, 'black');
		blackGrad.addColorStop(1, 'white');
		
		pathTriangle(ctx, arrow, false);
		ctx.lineCap = 'round';
		ctx.lineWidth = 3 / TRIAG_RAD;
		ctx.strokeStyle = colSolid;
		ctx.stroke();
		
		pathTriangle(ctx, triangle);
		ctx.fillStyle = blackGrad;
		ctx.fill();
		ctx.globalCompositeOperation = 'lighter';
		ctx.fillStyle = colorGrad;
		ctx.fill();
		
		ctx.restore();
		
		return triangle.map(n => {
			return {
				x: n.x * TRIAG_RAD + CANV_MID,
				y: n.y * TRIAG_RAD + CANV_MID
			};
		});
	}
	
	// puts in the context the path of three given vertices
	function pathTriangle(ctx, verts, close = true) {
		ctx.beginPath();
		ctx.moveTo(verts[0].x, verts[0].y);
		ctx.lineTo(verts[1].x, verts[1].y);
		ctx.lineTo(verts[2].x, verts[2].y);
		if (close) ctx.closePath();
	}
	
	// initialize color wheel markers
	function initMarkers() {
		CPicker.markers.hue = [{
			x: 0,
			y: 0,
			angle: 0
		}];
		CPicker.markers.satv = [{
			x: 0,
			y: 0,
			sat: 0,
			val: 0
		}];
		CPicker.markers.active = {
			type: 'hue', id: 0
		};
	}
	
	// draws all markers in the picker
	function drawMarkers() {
    const colorWheel = document.getElementById("colorWheel");
		let ctx = colorWheel.getContext('2d');
		
		// alias
		const MRK = CPicker.markers;
		const mainHue = MRK.hue[0].angle;
		
		ctx.save();
		
		MRK.hue.forEach((item) => {
			ctx.beginPath();
			ctx.arc(item.x, item.y, MARK_SIZE, 0, 6.283185307179586);
			ctx.fillStyle = getCSS_hsl(item.angle, 1, 0.5);
			ctx.fill();
			ctx.lineWidth = 2.1; ctx.strokeStyle = 'white';
			ctx.stroke();
			ctx.lineWidth = 1.9; ctx.strokeStyle = 'black';
			ctx.stroke();
		});
		
		MRK.satv.forEach((item) => {
			ctx.beginPath();
			ctx.arc(item.x, item.y, MARK_SIZE, 0, 6.283185307179586);
			ctx.fillStyle = getCSS_hsl(
				...getHSLfromHSV(mainHue, item.sat, item.val)
			);
			ctx.fill();
			ctx.lineWidth = 2.1; ctx.strokeStyle = 'black';
			ctx.stroke();
			ctx.lineWidth = 1.9; ctx.strokeStyle = 'white';
			ctx.stroke();
		});
		ctx.restore();
	}
	
	// selects the appropriate marker based on location
	function selectMarker(loc) {
		let idOut;
		idOut = CPicker.markers.hue.findIndex(item => {
			return distance(loc, item) < MARK_SIZE;
		});
		if (idOut > -1) {
			return {
				type: 'hue', id: idOut
			};
		}
		
		idOut = CPicker.markers.satv.findIndex(item => {
			return distance(loc, item) < MARK_SIZE;
		});
		if (idOut > -1) {
			return {
				type: 'satv', id: idOut
			};
		}
		
		return null;
	}
	
	// sets the hue marker using a location provided (e.g. mouse)
	function setHueMarkerByMse(index, newLoc) {
		let angle = Math.atan2(-newLoc.y + CANV_MID, newLoc.x - CANV_MID);
		CPicker.markers.hue[index].angle = angle * RAD_TO_DEG;
		let radius = (WHEEL_RAD_OUT + WHEEL_RAD_IN) / 2;
		CPicker.markers.hue[index].x = radius * Math.cos(angle) + CANV_MID;
		CPicker.markers.hue[index].y = -radius * Math.sin(angle) + CANV_MID;
	}
	
	// sets the hue marker using an angle
	function setHueMarkerByAngle(index, angle) {
		CPicker.markers.hue[index].angle = angle;
		angle /= RAD_TO_DEG;
		let radius = (WHEEL_RAD_OUT + WHEEL_RAD_IN) / 2;
		CPicker.markers.hue[index].x = radius * Math.cos(angle) + CANV_MID;
		CPicker.markers.hue[index].y = -radius * Math.sin(angle) + CANV_MID;
	}
	
	// sets the saturation and value markers using a location provided
	function setSatValMarkerByMse(index, newLoc, triVtx) {
		// get confined location [maybe not]
		// proxy prevents from overriding objects returned by function
		let proxyLoc = getConfinedProbe(newLoc, triVtx);
		let confLoc = {
			x: proxyLoc.x,
			y: proxyLoc.y
		};
		
		CPicker.markers.satv[index].x = confLoc.x;
		CPicker.markers.satv[index].y = confLoc.y;
		confLoc.x -= CANV_MID;
		confLoc.y -= CANV_MID;
		
		/*
		Computes the distance between the B corner of the triangle and the distance
		the bisector of B would travel to reach the mouse with its tangent attached
		to its head (mouse-distance).
		*/
		CPicker.markers.satv[index].val = distance(
			confLoc,
			normalProjection({
				x: confLoc.x,
				y: confLoc.y
			}, {
				x: triVtx[1].x - CANV_MID,
				y: triVtx[1].y - CANV_MID
			})
		) / (TRIAG_RAD * 1.5);
		
		/*
		Computes ratio between the slice tangent to the head of bisector of B at
		mouse-distance and the side length of triangle.
		*/
		let val = CPicker.markers.satv[index].val;
		let satA = vecLerp(triVtx[1], triVtx[0], val);
		let satC = vecLerp(triVtx[1], triVtx[2], val);
		let sat = distance(proxyLoc, satC) / distance(satA, satC);
		CPicker.markers.satv[index].sat = isFinite(sat) ? sat : 0;
	}
	
	// sets the saturation and value markers using values
	function setSatValMarkerByNumber(index, sat, val, triVtx) {
		/*
		calculates the distance between the B and the farthest edge to compute the
		value then uses those two points linearly interpolate the saturation.
		*/
		let satA = vecLerp(triVtx[1], triVtx[0], val);
		let satC = vecLerp(triVtx[1], triVtx[2], val);
		let markerLoc = vecLerp(satC, satA, sat);
		
		CPicker.markers.satv[index].sat = sat;
		CPicker.markers.satv[index].val = val;
		CPicker.markers.satv[index].x = markerLoc.x;
		CPicker.markers.satv[index].y = markerLoc.y;
	}

  // determines if two arrays are equal (memberwise)
	function isEqual(lhs, rhs) {
		if (lhs.length !== rhs.length) return false;
		let output = true;
		for (var i = 0; i < lhs.length; ++i) {
			output = output && lhs[i] === rhs[i];
			if (!output) return output;
		}
		return output;
	}
	
	// returns a function that maps between the specified color spaces
	function mapToColorSpace(clFrom, clTo) {
		if (clFrom === clTo) return (...args) => args[0];
		
		let convFunc;
		let rxAlpha;
		
		switch (true) {
			case /rgba?/.test(clFrom) && /rgba?/.test(clTo):
				convFunc = (r, g, b) => [r, g, b];
				rxAlpha = /[a-z]{3}a/;
				break;
			case /rgba?/.test(clFrom) && /hsla?/.test(clTo):
				convFunc = getHSLfromRGB;
				rxAlpha = /[a-z]{3}a/;
				break;
			case /rgba?/.test(clFrom) && /hs[vb]a?/.test(clTo):
				convFunc = getHSVfromRGB;
				rxAlpha = /[a-z]{3}a/;
				break;
			case /hsla?/.test(clFrom) && /hsla?/.test(clTo):
				convFunc = (h, s, l) => [h, s, l];
				rxAlpha = /[a-z]{3}a/;
				break;
			case /hsla?/.test(clFrom) && /rgba?/.test(clTo):
				convFunc = getRGBfromHSL;
				rxAlpha = /[a-z]{3}a/;
				break;
			case /hsla?/.test(clFrom) && /hs[vb]a?/.test(clTo):
				convFunc = getHSVfromHSL;
				rxAlpha = /[a-z]{3}a/;
				break;
			case /hs[vb]a?/.test(clFrom) && /hs[vb]a?/.test(clTo):
				convFunc = (h, s, v) => [h, s, v];
				rxAlpha = /[a-z]{3}a/;
				break;
			case /hs[vb]a?/.test(clFrom) && /rgba?/.test(clTo):
				convFunc = getRGBfromHSV;
				rxAlpha = /[a-z]{3}a/;
				break;
			case /hs[vb]a?/.test(clFrom) && /hsla?/.test(clTo):
				convFunc = getHSLfromHSV;
				rxAlpha = /[a-z]{3}a/;
				break;
			default:
				throw new CustomError('Argument error', `There is no conversion between ${clFrom} and ${clTo}`);
		}
		
		/*jshint bitwise: false */
		// bitfield to decide what to do with alpha disparity
		let aBf = (rxAlpha.test(clFrom) ? 1 : 0) | (rxAlpha.test(clTo) ? 2 : 0);
		/*jshint bitwise: true */
		
		switch (aBf) {
			case 0: // none to none - does nothing
				return (args) => convFunc(...args);
			case 1: // alpha to none - alpha value gets ignored
				return (args) => {return convFunc(...args);};
			case 2: // none to alpha - 1 is added as alpha value
				return (args) => {return convFunc(...args).concat(1);};
			case 3: // alpha to alpha - alpha value gets added to output
				return (args) => {let al = args.pop(); return convFunc(...args).concat(al);};
			default:
				throw new CustomError('Unknown error', `The bitfield has a value of ${aBf}. What kind of sorcery is this?`);
		}
	}
	
	// returns an array with RGB values from an HSL color space
	function getRGBfromHSL(hue, sat, light) {
		const mod = (n, m) => (n * m >= 0 ? n % m : n % m + m);
		let ls_ratio = Math.min(light, 1 - light)*sat;
		
		return [0, 8, 4].map((offset, i) => {
			return mod((offset + hue/30), 12);
		}).map((kval, i) => {
			return light - ls_ratio*Math.max(Math.min(Math.min(kval - 3, 9 - kval), 1), -1);
		});
	}
	
	// returns an array with RGB values from an HSV color space
	function getRGBfromHSV(hue, sat, value) {
		const mod = (n, m) => (n * m >= 0 ? n % m : n % m + m);
		let vs_ratio = value*sat;
		
		return [5, 3, 1].map((offset, i) => {
			return mod((offset + hue/60), 6);
		}).map((kval, i) => {
			return value - vs_ratio*Math.max(Math.min(Math.min(kval, 4 - kval),1),0);
		});
	}
	
	// returns an array with HSV values from an RGB color space
	function getHSVfromRGB(red, green, blue) {
		let value = Math.max(red, green, blue);
		let range = value - Math.min(red, green, blue);
		
		let sat = (value === 0 ? 0 : range / value);
		let hue;
		if (range === 0)					hue = 0;
		else if (value === red) 	hue = 60 * (green - blue) / range;
		else if (value === green)	hue = 60 * (2 + (blue - red) / range);
		else if (value === blue)	hue = 60 * (4 + (red - green) / range);
		
		return [hue, sat, value];
	}
	
	// returns an array with HSV values from an HSL color space
	function getHSVfromHSL(hue, sat, light) {
		let v = light + sat * Math.min(light, 1 - light);
		let s = (v == 0 ? 0 : 2 * (1 - light / v));
		return [hue, s, v];
	}
	
	// returns an array with HSL values from an RGB color space
	function getHSLfromRGB(red, green, blue) {
		let max = Math.max(red, green, blue);
		let range = max - Math.min(red, green, blue);
		
		let li = max - range / 2;
		let sat = (li == 0 || li == 1 ? 0 : (max - li) / Math.min(li, 1 - li));
		let hue;
		if (range === 0)				hue = 0;
		else if (max === red) 	hue = 60 * (green - blue) / range;
		else if (max === green)	hue = 60 * (2 + (blue - red) / range);
		else if (max === blue)	hue = 60 * (4 + (red - green) / range);
		
		return [hue, sat, li];
	}
	
	// returns an array with HSL values from an HSV color space
	function getHSLfromHSV(hue, sat, value) {
		let li = value * (1 - sat / 2);
		let s = (li == 0 || li == 1 ? 0 : (value - li) / Math.min(li, 1 - li));
		return [hue, s, li];
	}
	
	// returns an array containing the CSS funcion name and its parameters destructured and normalized (except for degree angles those stay as they are)
	function parseCSSFunc(value) {
		if (typeof value !== 'string') throw new CustomError('Argument error', `value '${value}' is not a valid string`);
		const rxSignature = /^([a-zA-Z]+)(\(.+\))$/i;
		const rxArgs = /\(\s*([+-]?(?:\d*?\.)?\d+%?)\s*,\s*([+-]?(?:\d*?\.)?\d+%?)\s*,\s*([+-]?(?:\d*?\.)?\d+%?)\s*(?:,\s*([+-]?(?:\d*?\.)?\d+%?)\s*)?\)/;
		
		// map of non-numbers as parameters
		const NUMMAP_RGB = [false, false, false];
		const NUMMAP_HSL = [false, true, true];
		
		// gets function name and argument set
		let [ , funcName = '', argSet = ''] = value.trim().match(rxSignature) || [];
		// matches the list of arguments (trimmed)
		let args = argSet.match(rxArgs);
		if (args === null) throw new CustomError('Type error', 'the value provided is not a CSS function');
		// remove full match and alpha from array, store alpha in variable
		let alpha = (args = args.slice(1)).pop();
		// truthy map if argument evaluates as NaN
		let pType = args.map(isNaN);
		
		let output;
		
		// select the format of parameters
		switch (true) {
			case funcName === 'rgb':
			case funcName === 'rgba':
				if (!isEqual(pType, NUMMAP_RGB)) throw new CustomError('Argument error', 'RGB arguments are not valid');
				output = args.map((num) => {
					return parseFloat(num / 255);
				});
				
				break;
			case funcName === 'hsl':
			case funcName === 'hsla':
				if (!isEqual(pType, NUMMAP_HSL)) throw new CustomError('Argument error', 'HSL parameters are not valid');
				output = args.map(parseFloat).map((num, i) => {
					return num * (pType[i] ? 0.01 : 1);
				});
				break;
			default:
				throw new CustomError('Argument error', `${funcName} is not a recognized CSS function`);
		}
		
		if (typeof alpha !== 'undefined') {
			if (funcName.length === 3) throw new CustomError('Argument error', `${funcName} function only recieves 3 arguments`);
			output.push(parseFloat(alpha) * (isNaN(alpha) ? 0.01 : 1));
		}
		
		return [funcName].concat(output);
	}
	
	// returns an array containing a desctructured version of a valid CSS hex color
	function parseCSSHex(value, numeric = false) {
		if (typeof value !== 'string') throw new CustomError('Argument error', 'value is not a valid string');
		const rxHex = /^#((?:[0-9a-z]){3,8})$/i;
		
		let hex = value.match(rxHex);
		if (hex === null) throw new CustomError('Type error', 'the value provided is not a CSS hex color');
		hex = hex[1];
		
		let output;
		switch (hex.length) {
			case 3:
				output = hex.match(/(.)(.)(.)/).splice(1);
				output = output.map(elem => elem + elem);
				break;
			case 6:
				output = hex.match(/(..)(..)(..)/).splice(1);
				break;
			case 4:
				output = hex.match(/(.)(.)(.)(.)/).splice(1);
				output = output.map(elem => elem + elem);
				break;
			case 8:
				output = hex.match(/(..)(..)(..)(..)/).splice(1);
				break;
			default:
				throw new CustomError('Argument error', `${value} is not a valid CSS hex color`);
		}
		
		if (numeric) {
			output = output.map((item) => {
				return (Number(`0x${item}`)) / 255;
			});
		}
		
		return output;
	}
	
	// Retruns the CSS hex value of given named CSS color
	function parseNamedColor(input) {
		const NAME_TABLE = {
			'black' : '#000000', 'navy' : '#000080',
			'darkblue' : '#00008b', 'mediumblue' : '#0000cd',
			'blue' : '#0000ff', 'darkgreen' : '#006400',
			'green' : '#008000', 'teal' : '#008080',
			'darkcyan' : '#008b8b', 'deepskyblue' : '#00bfff',
			'darkturquoise' : '#00ced1', 'mediumspringgreen' : '#00fa9a',
			'lime' : '#00ff00', 'springgreen' : '#00ff7f',
			'aqua' : '#00ffff', 'cyan' : '#00ffff',
			'midnightblue' : '#191970', 'dodgerblue' : '#1e90ff',
			'lightseagreen' : '#20b2aa', 'forestgreen' : '#228b22',
			'seagreen' : '#2e8b57', 'darkslategray' : '#2f4f4f',
			'darkslategrey' : '#2f4f4f', 'limegreen' : '#32cd32',
			'mediumseagreen' : '#3cb371', 'turquoise' : '#40e0d0',
			'royalblue' : '#4169e1', 'steelblue' : '#4682b4',
			'darkslateblue' : '#483d8b', 'mediumturquoise' : '#48d1cc',
			'indigo' : '#4b0082', 'darkolivegreen' : '#556b2f',
			'cadetblue' : '#5f9ea0', 'cornflowerblue' : '#6495ed',
			'rebeccapurple' : '#663399', 'mediumaquamarine' : '#66cdaa',
			'dimgray' : '#696969', 'dimgrey' : '#696969',
			'slateblue' : '#6a5acd', 'olivedrab' : '#6b8e23',
			'slategray' : '#708090', 'slategrey' : '#708090',
			'lightslategray' : '#778899', 'lightslategrey' : '#778899',
			'mediumslateblue' : '#7b68ee', 'lawngreen' : '#7cfc00',
			'chartreuse' : '#7fff00', 'aquamarine' : '#7fffd4',
			'maroon' : '#800000', 'purple' : '#800080',
			'olive' : '#808000', 'gray' : '#808080',
			'grey' : '#808080', 'skyblue' : '#87ceeb',
			'lightskyblue' : '#87cefa', 'blueviolet' : '#8a2be2',
			'darkred' : '#8b0000', 'darkmagenta' : '#8b008b',
			'saddlebrown' : '#8b4513', 'darkseagreen' : '#8fbc8f',
			'lightgreen' : '#90ee90', 'mediumpurple' : '#9370db',
			'darkviolet' : '#9400d3', 'palegreen' : '#98fb98',
			'darkorchid' : '#9932cc', 'yellowgreen' : '#9acd32',
			'sienna' : '#a0522d', 'brown' : '#a52a2a',
			'darkgray' : '#a9a9a9', 'darkgrey' : '#a9a9a9',
			'lightblue' : '#add8e6', 'greenyellow' : '#adff2f',
			'paleturquoise' : '#afeeee', 'lightsteelblue' : '#b0c4de',
			'powderblue' : '#b0e0e6', 'firebrick' : '#b22222',
			'darkgoldenrod' : '#b8860b', 'mediumorchid' : '#ba55d3',
			'rosybrown' : '#bc8f8f', 'darkkhaki' : '#bdb76b',
			'silver' : '#c0c0c0', 'mediumvioletred' : '#c71585',
			'indianred' : '#cd5c5c', 'peru' : '#cd853f',
			'chocolate' : '#d2691e', 'tan' : '#d2b48c',
			'lightgray' : '#d3d3d3', 'lightgrey' : '#d3d3d3',
			'thistle' : '#d8bfd8', 'orchid' : '#da70d6',
			'goldenrod' : '#daa520', 'palevioletred' : '#db7093',
			'crimson' : '#dc143c', 'gainsboro' : '#dcdcdc',
			'plum' : '#dda0dd', 'burlywood' : '#deb887',
			'lightcyan' : '#e0ffff', 'lavender' : '#e6e6fa',
			'darksalmon' : '#e9967a', 'violet' : '#ee82ee',
			'palegoldenrod' : '#eee8aa', 'lightcoral' : '#f08080',
			'khaki' : '#f0e68c', 'aliceblue' : '#f0f8ff',
			'honeydew' : '#f0fff0', 'azure' : '#f0ffff',
			'sandybrown' : '#f4a460', 'wheat' : '#f5deb3',
			'beige' : '#f5f5dc', 'whitesmoke' : '#f5f5f5',
			'mintcream' : '#f5fffa', 'ghostwhite' : '#f8f8ff',
			'salmon' : '#fa8072', 'antiquewhite' : '#faebd7',
			'linen' : '#faf0e6', 'lightgoldenrodyellow' : '#fafad2',
			'oldlace' : '#fdf5e6', 'red' : '#ff0000',
			'fuchsia' : '#ff00ff', 'magenta' : '#ff00ff',
			'deeppink' : '#ff1493', 'orangered' : '#ff4500',
			'tomato' : '#ff6347', 'hotpink' : '#ff69b4',
			'coral' : '#ff7f50', 'darkorange' : '#ff8c00',
			'lightsalmon' : '#ffa07a', 'orange' : '#ffa500',
			'lightpink' : '#ffb6c1', 'pink' : '#ffc0cb',
			'gold' : '#ffd700', 'peachpuff' : '#ffdab9',
			'navajowhite' : '#ffdead', 'moccasin' : '#ffe4b5',
			'bisque' : '#ffe4c4', 'mistyrose' : '#ffe4e1',
			'blanchedalmond' : '#ffebcd', 'papayawhip' : '#ffefd5',
			'lavenderblush' : '#fff0f5', 'seashell' : '#fff5ee',
			'cornsilk' : '#fff8dc', 'lemonchiffon' : '#fffacd',
			'floralwhite' : '#fffaf0', 'snow' : '#fffafa',
			'yellow' : '#ffff00', 'lightyellow' : '#ffffe0',
			'ivory' : '#fffff0', 'white' : '#ffffff'
		}; // !NAME_TABLE
		
		if (NAME_TABLE.hasOwnProperty(input.toLowerCase())) {
			return NAME_TABLE[input.toLowerCase()];
		} else {
			throw new CustomError('Type error', input + ' is not a recognized named color');
		}
	}
	
	// converts a hsl pack into an hsl CSS function
	function getCSS_hsl(hue, sat, light, alpha = 1) {
		if (alpha === 1) {
			return `hsl(${hue},${sat * 100}%,${light * 100}%)`;
		} else {
			return `hsla(${hue},${sat * 100}%,${light * 100}%,${alpha})`;
		}
	}
	
	// returns a 6-digit hex of any given CSS color
	function getHex6(cssColor) {
		let output;
		
		// try if cssColor is a named color
		try {
			output = parseNamedColor(cssColor);
			return output;
		} catch (e) {
			// no need to log error, color might still be parsable
		}
		
		// try if cssColor is a hex value
		try {
			output = parseCSSHex(cssColor);
			// get rid of alpha channel if it exists
			if (output.length === 4) output.pop();
			
			// pads with 0 if number is less than 0x10
			output = output.map((item) => {
				return (item.length === 1 ? '0' : '') + item;
			});
			
			// merges numbers into hex format #nnnnnn
			return `#${output.join('')}`;
			
		} catch (e) {
			// no need to log error, color might still be parsable
		}
		
		// try if cssColor is a function
		try {
			output = parseCSSFunc(cssColor);
			let funcName = output.splice(0, 1)[0];
			
			// maps current color space onto rgb and converts the normalized coefficients onto a hexadecimal string
			output = (mapToColorSpace(funcName, 'rgb')(output)).map((num) => {
				return Math.trunc(num * 255).toString(16);
			});
			
			// pads with 0 if number is less than 0x10
			output = output.map((item) => {
				return (item.length === 1 ? '0' : '') + item;
			});
			
			output = `#${output.join('')}`;
		} catch (e) {
			console.error(`${e.name}:${e.message}`);
			output = '#7F7F7F';
		} finally {
			return output;
		}
		
	}
	
	// returns an HSV array from any given CSS color
	function getHSVpack(cssColor) {
		let output;
		
		// try if cssColor is a named color
		try {
			output = parseCSSHex(parseNamedColor(cssColor), true);
			output = mapToColorSpace('rgb', 'hsva')(output);
			return output;
		} catch (e) {
			// no need to log error, color might still be parsable
		}
		
		// try if cssColor is a hex value
		try {
			output = parseCSSHex(cssColor, true);
			if (output.length === 4) {
				output = mapToColorSpace('rgba', 'hsva')(output);
			} else {
				output = mapToColorSpace('rgb', 'hsva')(output);
			}
			return output;
		} catch (e) {
			// no need to log error, color might still be parsable
		}
		
		// try if cssColor is a function
		try {
			output = parseCSSFunc(cssColor);
			let funcName = output.splice(0, 1)[0];
			
			// maps current color space onto hsv
			output = mapToColorSpace(funcName, 'hsva')(output);
		} catch (e) {
			console.error(`${e.name}:${e.message}`);
			output = [0, 0.5, 0, 1]; // gray
		} finally {
			return output;
		}
	}
	
	// returns an RGB array from any given CSS color
	function getRGBpack(cssColor) {
		let output;
		
		// try if cssColor is a named color
		try {
			return parseCSSHex(parseNamedColor(cssColor), true);
		} catch (e) {
			// no need to log error, color might still be parsable
		}
		
		// try if cssColor is a hex value
		try {
			return parseCSSHex(cssColor, true);
		} catch (e) {
			// no need to log error, color might still be parsable
		}
		
		// try if cssColor is a function
		try {
			output = parseCSSFunc(cssColor);
			let funcName = output.splice(0, 1)[0];
			
			// maps current color space onto rgb
			output = mapToColorSpace(funcName, 'rgba')(output);
		} catch (e) {
			console.error(`${e.name}:${e.message}`);
			output = [0.5, 0.5, 0.5, 1]; // gray
		} finally {
			return output;
		}
	}

  // returns a positive coterminal angle
	function getCoterminalAngle(src, max = 360) {
		if (src >= 0 && src < max) return src;
		const mod = (n, m) => (n * m >= 0 ? n % m : n % m + m);
		return mod(src, max);
	}
	
	// returns a number confined by min and max (inclusive)
	function minmax(num, min, max) {
		return Math.min(Math.max(num, min), max);
	}
	
	// returns the distance between the points a and b
	function distance(a, b) {
		return Math.hypot(b.x - a.x, b.y - a.y);
	}
	
	// returns a point that is in the middle of a and b
	function midpoint(a, b) {
		return {
			x: (a.x + b.x) / 2,
			y: (a.y + b.y) / 2
		};
	}
	
	// gets the normal vector of the input
	function getNormal(v) {
		return {
			x: -v.y,
			y: v.x
		};
	}
	
	// returns the linear interpolation of a and b at t
	function vecLerp(a, b, t) {
		return {
			x: (1 - t) * a.x + t * b.x,
			y: (1 - t) * a.y + t * b.y
		};
	}
	
	// returns how far perpendicularly p is from a line that passes thru a and b
	function getWinding(p, a, b) {
		return (p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x);
	}
	
	// finds the intersection point between lines (a1, a2) and (b1, b2)
	function findIntersection(a1, a2, b1, b2) {
		// denominator might be zero and return NaN
		return (
			(b1.x - a1.x) * (b1.y - b2.y) - (b1.y - a1.y) * (b1.x - b2.x)
		) / (
			(a2.x - a1.x) * (b1.y - b2.y) - (a2.y - a1.y) * (b1.x - b2.x)
		);
	}
	
	// projects v1 onto the normal of v2 offset to the head of v2
	function normalProjection(v1, v2) {
		// equation written by u/MLGcrumpets
		let sq2x = v2.x * v2.x;
		let sq2y = v2.y * v2.y;
		
		return {
			x: (sq2y * (v2.x + v1.x) + v2.x * (sq2x - v2.y * v1.y)) / (sq2y + sq2x),
			y: (sq2x * (v2.y + v1.y) + v2.y * (sq2y - v2.x * v1.x)) / (sq2y + sq2x)
		};
	}
	
	// determines if loc is inside a triangle
	function isInTriangle(loc, triVtx) {
		return (
			getWinding(loc, triVtx[0], triVtx[1]) > 0 &&
			getWinding(loc, triVtx[1], triVtx[2]) > 0 &&
			getWinding(loc, triVtx[2], triVtx[0]) > 0
		);
	}
	
	// returns a value confined to the boundaries of a triangle
	function getConfinedProbe(loc, triVtx) {
		/*jshint bitwise: false */
		const AREA_OUT_A = 2;
		const AREA_OUT_B = 4;
		const AREA_OUT_C = 1;
		const AREA_OUT_AB = AREA_OUT_A | AREA_OUT_B;
		const AREA_OUT_BC = AREA_OUT_B | AREA_OUT_C;
		const AREA_OUT_CA = AREA_OUT_C | AREA_OUT_A;
		const AREA_IN = AREA_OUT_A | AREA_OUT_B | AREA_OUT_C;
		
		let A = triVtx[0];
		let B = triVtx[1];
		let C = triVtx[2];
		let ab = getWinding(loc, A, B);
		let bc = getWinding(loc, B, C);
		let ca = getWinding(loc, C, A);
		
		let bitfi = (ab > 0 ? 1 : 0) | (bc > 0 ? 2 : 0) | (ca > 0 ? 4 : 0);
		/*jshint bitwise: true */
		
		switch (true) {
			case bitfi === AREA_IN:
				return loc;
			case bitfi === AREA_OUT_AB:
				return vecLerp(loc, C, findIntersection(loc, C, A, B));
			case bitfi === AREA_OUT_BC:
				return vecLerp(loc, A, findIntersection(loc, A, B, C));
			case bitfi === AREA_OUT_CA:
				return vecLerp(loc, B, findIntersection(loc, B, C, A));
			case bitfi === AREA_OUT_A:
				return A;
			case bitfi === AREA_OUT_B:
				return B;
			case bitfi === AREA_OUT_C:
				return C;
			default:
				// throw; // ADD CUSTOM ERROR
		}
	}

  // binds a list of elements to a single callback on the same listener
	function bindListenerToNodes(elemList, eventName, callback) {
		for (let elem of elemList) {
			elem.addEventListener(eventName, callback);
		}
	}

}());