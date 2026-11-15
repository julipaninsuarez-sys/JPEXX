/* Lab: reproduce sobre el escenario un video con transparencia (la cápsula animada en Blender).
 *
 * El video viene "apilado": arriba la imagen y abajo, en grises, cuánto se ve cada punto (alfa).
 * Así anda en todos los navegadores (iPhone incluido) con un MP4 común; acá se junta todo con
 * WebGL (la placa de video), que es lo más liviano para el celu.
 *
 *   var p = JPEXCapsuleVideo.create(stage, {
 *       src: '/static/video/lab/capsula-c-670.mp4',
 *       rect: { left: 30, top: 12, width: 40, height: 88 }   // en % del escenario
 *   });
 *   p.play();      // desde el principio
 *   p.destroy();
 */
(function () {
    'use strict';

    var VERT = 'attribute vec2 p; varying vec2 uv;' +
        'void main(){ uv = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5); gl_Position = vec4(p, 0.0, 1.0); }';
    // Mitad de arriba: color. Mitad de abajo: alfa. Sale premultiplicado (color × alfa).
    var FRAG = 'precision mediump float; varying vec2 uv; uniform sampler2D t;' +
        'void main(){ vec3 c = texture2D(t, vec2(uv.x, uv.y * 0.5)).rgb;' +
        ' float a = texture2D(t, vec2(uv.x, 0.5 + uv.y * 0.5)).r;' +
        ' gl_FragColor = vec4(c * a, a); }';

    function create(stage, opts) {
        var wrap = document.createElement('div');
        wrap.className = 'jpx-capvideo';
        wrap.setAttribute('aria-hidden', 'true');
        var r = opts.rect;
        wrap.style.cssText = 'position:absolute;pointer-events:none;left:' + r.left + '%;top:' + r.top +
            '%;width:' + r.width + '%;height:' + r.height + '%;';
        var canvas = document.createElement('canvas');
        canvas.style.cssText = 'width:100%;height:100%;display:block;';
        wrap.appendChild(canvas);
        stage.appendChild(wrap);

        var video = document.createElement('video');
        video.muted = true;
        video.defaultMuted = true;
        video.playsInline = true;
        video.setAttribute('playsinline', '');
        video.setAttribute('muted', '');
        video.preload = 'auto';
        video.crossOrigin = 'anonymous';
        video.src = opts.src;

        var gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false });
        var tex = null;
        if (gl) {
            var prog = gl.createProgram();
            [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, FRAG]].forEach(function (s) {
                var sh = gl.createShader(s[0]);
                gl.shaderSource(sh, s[1]);
                gl.compileShader(sh);
                gl.attachShader(prog, sh);
            });
            gl.linkProgram(prog);
            gl.useProgram(prog);
            var buf = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, buf);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
            var loc = gl.getAttribLocation(prog, 'p');
            gl.enableVertexAttribArray(loc);
            gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
            tex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.clearColor(0, 0, 0, 0);
        }

        function draw() {
            if (!gl || video.readyState < 2) return;
            var w = video.videoWidth, h = video.videoHeight / 2;
            if (canvas.width !== w || canvas.height !== h) {
                canvas.width = w;
                canvas.height = h;
                gl.viewport(0, 0, w, h);
            }
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, video);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }

        var looping = false;
        function loop() {
            draw();
            if (!looping) return;
            if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(loop);
            else requestAnimationFrame(loop);
        }

        video.addEventListener('loadeddata', draw);          // primer cuadro (cerrada) apenas carga
        video.addEventListener('seeked', draw);
        video.addEventListener('ended', function () { looping = false; draw(); });

        return {
            el: wrap,
            video: video,
            play: function () {
                video.currentTime = 0;
                var go = video.play();
                looping = true;
                if (go && go.catch) go.catch(function () { looping = false; });
                loop();
            },
            reset: function () {
                looping = false;
                video.pause();
                video.currentTime = 0;
            },
            destroy: function () {
                looping = false;
                video.pause();
                video.removeAttribute('src');
                video.load();
                wrap.remove();
            }
        };
    }

    window.JPEXCapsuleVideo = { create: create };
})();
