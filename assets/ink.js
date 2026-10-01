/* Ink behind the opening band: tone-on-tone rings on the indigo field.
   Rings are exact (each drop is a closed-form, area-preserving push on every
   earlier drop), so edges stay crisp at any size. A small fluid solver only
   moves the water's coordinates; the pointer stirs it. Nothing moves unless
   ink is landing or someone is stirring. Purely decorative: no controls. */
(function () {
  'use strict';
  var host = document.querySelector('[data-ink]');
  var band = host && host.parentElement;
  if (!host) return;
  var canvas = host.querySelector('canvas');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function fallback() { host.style.display = 'none'; }

  var gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false });
  if (!gl) return fallback();
  if (!gl.getExtension('EXT_color_buffer_float') && !gl.getExtension('EXT_color_buffer_half_float')) return fallback();

  var MAX = 88;
  var VS = '#version 300 es\nin vec2 a;out vec2 vUv;void main(){vUv=a*.5+.5;gl_Position=vec4(a,0.,1.);}';
  var HEAD = '#version 300 es\nprecision highp float;precision highp sampler2D;in vec2 vUv;out vec4 o;';

  var FS = {
    advect: HEAD + 'uniform sampler2D uVel,uSrc;uniform vec2 texel;uniform float dt,damp,isDisp;' +
      'void main(){vec2 v=texture(uVel,vUv).xy;vec2 c=vUv-dt*v*texel;vec4 r=texture(uSrc,c);' +
      'if(isDisp>.5){o=vec4(r.xy-dt*v*texel,0.,1.);}else{o=r/(1.+damp*dt);}}',
    splat: HEAD + 'uniform sampler2D uTarget;uniform float aspect,radius;uniform vec2 point,force;' +
      'void main(){vec2 p=vUv-point;p.x*=aspect;o=vec4(texture(uTarget,vUv).xy+exp(-dot(p,p)/radius)*force,0.,1.);}',
    curl: HEAD + 'uniform sampler2D uVel;uniform vec2 texel;' +
      'void main(){float L=texture(uVel,vUv-vec2(texel.x,0.)).y,R=texture(uVel,vUv+vec2(texel.x,0.)).y,' +
      'T=texture(uVel,vUv+vec2(0.,texel.y)).x,B=texture(uVel,vUv-vec2(0.,texel.y)).x;o=vec4(.5*(R-L-T+B),0.,0.,1.);}',
    vort: HEAD + 'uniform sampler2D uVel,uCurl;uniform vec2 texel;uniform float dt,amount;' +
      'void main(){float L=texture(uCurl,vUv-vec2(texel.x,0.)).x,R=texture(uCurl,vUv+vec2(texel.x,0.)).x,' +
      'T=texture(uCurl,vUv+vec2(0.,texel.y)).x,B=texture(uCurl,vUv-vec2(0.,texel.y)).x,C=texture(uCurl,vUv).x;' +
      'vec2 f=.5*vec2(abs(T)-abs(B),abs(R)-abs(L));f/=length(f)+1e-4;f*=amount*C;f.y*=-1.;' +
      'o=vec4(texture(uVel,vUv).xy+f*dt,0.,1.);}',
    div: HEAD + 'uniform sampler2D uVel;uniform vec2 texel;' +
      'void main(){float L=texture(uVel,vUv-vec2(texel.x,0.)).x,R=texture(uVel,vUv+vec2(texel.x,0.)).x,' +
      'T=texture(uVel,vUv+vec2(0.,texel.y)).y,B=texture(uVel,vUv-vec2(0.,texel.y)).y;o=vec4(.5*(R-L+T-B),0.,0.,1.);}',
    pressure: HEAD + 'uniform sampler2D uP,uDiv;uniform vec2 texel;' +
      'void main(){float L=texture(uP,vUv-vec2(texel.x,0.)).x,R=texture(uP,vUv+vec2(texel.x,0.)).x,' +
      'T=texture(uP,vUv+vec2(0.,texel.y)).x,B=texture(uP,vUv-vec2(0.,texel.y)).x;o=vec4((L+R+T+B-texture(uDiv,vUv).x)*.25,0.,0.,1.);}',
    grad: HEAD + 'uniform sampler2D uP,uVel;uniform vec2 texel;' +
      'void main(){float L=texture(uP,vUv-vec2(texel.x,0.)).x,R=texture(uP,vUv+vec2(texel.x,0.)).x,' +
      'T=texture(uP,vUv+vec2(0.,texel.y)).x,B=texture(uP,vUv-vec2(0.,texel.y)).x;' +
      'vec2 e=smoothstep(0.,.04,vUv)*smoothstep(0.,.04,1.-vUv);' +
      'o=vec4((texture(uVel,vUv).xy-.5*vec2(R-L,T-B))*e.x*e.y,0.,1.);}',
    scale: HEAD + 'uniform sampler2D uSrc;uniform float k;void main(){o=texture(uSrc,vUv)*k;}',
    render: HEAD + 'uniform sampler2D uDisp;uniform vec2 res;uniform float aspect;uniform int count,taps;' +
      'uniform vec4 drops[' + MAX + '];uniform vec3 paper,inkDark,inkLight;' +
      'float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}' +
      'float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);' +
      'return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}' +
      'vec3 ink(vec2 uv){vec2 q=uv+texture(uDisp,uv).xy;q.x*=aspect;float t=0.;' +
      'for(int i=0;i<' + MAX + ';i++){if(i>=count)break;vec4 d=drops[count-1-i];vec2 v=q-d.xy;float d2=dot(v,v);' +
      'if(d2<d.z){t=d.w;break;}q=d.xy+v*sqrt(1.-d.z/d2);}' +
      'if(t<=0.)return paper;t*=.86+.14*vnoise(q*26.);return mix(inkLight,inkDark,t);}' +
      'void main(){vec2 px=1./res;vec3 c;' +
      'if(taps>1){c=(ink(vUv+px*vec2(.125,.375))+ink(vUv+px*vec2(-.375,.125))+ink(vUv+px*vec2(.375,-.125))+ink(vUv+px*vec2(-.125,-.375)))*.25;}' +
      'else{c=ink(vUv);}' +
      'c+=(hash(gl_FragCoord.xy)-.5)*.006;o=vec4(c,1.);}'
  };

  function compile(type, src) {
    var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  var vs;
  function program(fs) {
    var p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'a'); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    var u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < n; i++) { var name = gl.getActiveUniform(p, i).name.replace('[0]', ''); u[name] = gl.getUniformLocation(p, name); }
    return { p: p, u: u };
  }
  var P = {};
  try {
    vs = compile(gl.VERTEX_SHADER, VS);
    for (var k in FS) P[k] = program(FS[k]);
  } catch (e) { return fallback(); }

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  function target(w, h, internal, format) {
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, gl.HALF_FLOAT, null);
    var fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('fbo');
    gl.viewport(0, 0, w, h); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    return { tex: tex, fbo: fbo, w: w, h: h };
  }
  function pair(w, h, internal, format) {
    var a = target(w, h, internal, format), b = target(w, h, internal, format);
    return { get read() { return a; }, get write() { return b; }, swap: function () { var t = a; a = b; b = t; } };
  }

  var simH = 128, simW = 128, vel, prs, dsp, div, crl, texel;
  function buildSim(aspect) {
    simW = Math.max(64, Math.round(simH * Math.min(aspect, 2.2)));
    texel = [1 / simW, 1 / simH];
    vel = pair(simW, simH, gl.RG16F, gl.RG);
    prs = pair(simW, simH, gl.R16F, gl.RED);
    dsp = pair(simW * 2, simH * 2, gl.RG16F, gl.RG);
    div = target(simW, simH, gl.R16F, gl.RED);
    crl = target(simW, simH, gl.R16F, gl.RED);
  }

  function bind(unit, t) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t.tex); return unit; }
  function blit(t) {
    if (t) { gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo); gl.viewport(0, 0, t.w, t.h); }
    else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height); }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  var aspect = 1;
  function resize() {
    var r = host.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var w = Math.max(2, Math.round(r.width * dpr)), h = Math.max(2, Math.round(r.height * dpr));
    var cap = 1.1e6; if (w * h > cap) { var s = Math.sqrt(cap / (w * h)); w = Math.round(w * s); h = Math.round(h * s); }
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    aspect = w / h;
  }

  // ---- drops: x, y as fractions of the basin (y down), r in basin heights
  var drops = [], queue = [], t0 = 0, userDrops = 0;
  function site(fx, fy, n, rInk, rWater, start, gap) {
    for (var i = 0; i < n; i++) {
      var inky = i % 2 === 0;
      queue.push({ at: start + i * gap, fx: fx, fy: fy, r: inky ? rInk : rWater, tone: inky ? 0.42 + 0.58 * (i / Math.max(1, n - 2)) : 0 });
    }
  }
  function compose() {
    queue.length = 0;
    site(0.90, 0.22, 41, 0.100, 0.088, 100, 46);
    site(0.10, 0.96, 23, 0.070, 0.062, 700, 64);
    site(0.50, -0.06, 15, 0.056, 0.050, 1300, 76);
    queue.sort(function (a, b) { return a.at - b.at; });
  }
  var GROW = 420;
  function land(d, now, instant) { drops.push({ fx: d.fx, fy: d.fy, r: d.r, tone: d.tone, born: instant ? -1e9 : now }); }

  var dropData = new Float32Array(MAX * 4);
  function packDrops(now) {
    var growing = false, n = Math.min(drops.length, MAX);
    for (var i = 0; i < n; i++) {
      var d = drops[i], k = Math.min(1, (now - d.born) / GROW);
      if (k < 1) growing = true;
      k = 1 - Math.pow(1 - k, 3);
      dropData[i * 4] = d.fx * aspect; dropData[i * 4 + 1] = 1 - d.fy;
      dropData[i * 4 + 2] = d.r * d.r * k; dropData[i * 4 + 3] = d.tone;
    }
    return growing;
  }

  // ---- fluid
  function splat(x, y, fx, fy, radius) {
    gl.useProgram(P.splat.p);
    gl.uniform1i(P.splat.u.uTarget, bind(0, vel.read));
    gl.uniform1f(P.splat.u.aspect, aspect); gl.uniform1f(P.splat.u.radius, radius);
    gl.uniform2f(P.splat.u.point, x, y); gl.uniform2f(P.splat.u.force, fx, fy);
    blit(vel.write); vel.swap();
  }
  function fan() {
    splat(0.42, 0.62, 96, 26, 0.140); splat(0.78, 0.26, -70, 30, 0.100);
    splat(0.18, 0.30, 34, -52, 0.090); splat(0.94, 0.70, -28, -50, 0.080);
  }
  function step(dt) {
    gl.useProgram(P.curl.p); gl.uniform2fv(P.curl.u.texel, texel); gl.uniform1i(P.curl.u.uVel, bind(0, vel.read)); blit(crl);
    gl.useProgram(P.vort.p); gl.uniform2fv(P.vort.u.texel, texel); gl.uniform1f(P.vort.u.dt, dt); gl.uniform1f(P.vort.u.amount, authored ? 0 : 3);
    gl.uniform1i(P.vort.u.uVel, bind(0, vel.read)); gl.uniform1i(P.vort.u.uCurl, bind(1, crl)); blit(vel.write); vel.swap();
    gl.useProgram(P.div.p); gl.uniform2fv(P.div.u.texel, texel); gl.uniform1i(P.div.u.uVel, bind(0, vel.read)); blit(div);
    gl.useProgram(P.scale.p); gl.uniform1f(P.scale.u.k, 0.8); gl.uniform1i(P.scale.u.uSrc, bind(0, prs.read)); blit(prs.write); prs.swap();
    gl.useProgram(P.pressure.p); gl.uniform2fv(P.pressure.u.texel, texel); gl.uniform1i(P.pressure.u.uDiv, bind(1, div));
    for (var i = 0; i < 16; i++) { gl.uniform1i(P.pressure.u.uP, bind(0, prs.read)); blit(prs.write); prs.swap(); }
    gl.useProgram(P.grad.p); gl.uniform2fv(P.grad.u.texel, texel);
    gl.uniform1i(P.grad.u.uP, bind(0, prs.read)); gl.uniform1i(P.grad.u.uVel, bind(1, vel.read)); blit(vel.write); vel.swap();
    gl.useProgram(P.advect.p); gl.uniform2fv(P.advect.u.texel, texel); gl.uniform1f(P.advect.u.dt, dt);
    gl.uniform1f(P.advect.u.damp, 1.5); gl.uniform1f(P.advect.u.isDisp, 0);
    gl.uniform1i(P.advect.u.uVel, bind(0, vel.read)); gl.uniform1i(P.advect.u.uSrc, bind(0, vel.read)); blit(vel.write); vel.swap();
    gl.uniform1f(P.advect.u.isDisp, 1);
    gl.uniform1i(P.advect.u.uVel, bind(0, vel.read)); gl.uniform1i(P.advect.u.uSrc, bind(1, dsp.read)); blit(dsp.write); dsp.swap();
  }
  function still() {
    gl.useProgram(P.scale.p); gl.uniform1f(P.scale.u.k, 0);
    gl.uniform1i(P.scale.u.uSrc, bind(0, vel.read)); blit(vel.write); vel.swap();
  }
  function draw(now, taps) {
    var growing = packDrops(now);
    gl.useProgram(P.render.p);
    gl.uniform1i(P.render.u.uDisp, bind(0, dsp.read));
    gl.uniform2f(P.render.u.res, canvas.width, canvas.height);
    gl.uniform1f(P.render.u.aspect, aspect);
    gl.uniform1i(P.render.u.count, Math.min(drops.length, MAX)); gl.uniform1i(P.render.u.taps, taps);
    gl.uniform4fv(P.render.u.drops, dropData);
    gl.uniform3f(P.render.u.paper, 0.106, 0.169, 0.294);
    gl.uniform3f(P.render.u.inkDark, 0.165, 0.251, 0.420);
    gl.uniform3f(P.render.u.inkLight, 0.122, 0.192, 0.333);
    blit(null);
    return growing;
  }

  // ---- loop: runs only while ink is landing or the water is moving
  var raf = 0, last = 0, activeUntil = 0, fanned = 0, visible = true, authored = true;
  function frame(now) {
    raf = 0;
    if (!visible) return;
    var dt = Math.min(0.033, Math.max(0.008, (now - last) / 1000)); last = now;
    var t = now - t0;
    while (queue.length && queue[0].at <= t) land(queue.shift(), now, false);
    if (fanned === 0 && t > 2300) { fan(); fanned = 1; activeUntil = Math.max(activeUntil, now + 2300); }
    if (authored && fanned === 1 && t > 4700) { still(); authored = false; }
    var moving = now < activeUntil;
    if (moving) step(dt);
    var growing = draw(now, 1);
    if (moving || growing || queue.length) raf = requestAnimationFrame(frame);
    else draw(now, 4);
  }
  function wake(ms) {
    activeUntil = Math.max(activeUntil, performance.now() + ms);
    if (!raf && visible) { last = performance.now(); raf = requestAnimationFrame(frame); }
  }

  function begin() {
    drops.length = 0; userDrops = 0; fanned = 0; authored = true;
    resize(); compose();
    if (!vel) buildSim(aspect);
    else {
      gl.useProgram(P.scale.p); gl.uniform1f(P.scale.u.k, 0);
      [vel, prs, dsp].forEach(function (b) { gl.uniform1i(P.scale.u.uSrc, bind(0, b.read)); blit(b.write); b.swap(); gl.uniform1i(P.scale.u.uSrc, bind(0, b.read)); blit(b.write); b.swap(); });
    }
    if (reduce) {
      queue.forEach(function (d) { land(d, 0, true); }); queue.length = 0;
      fan(); for (var i = 0; i < 70; i++) step(1 / 60);
      still(); fanned = 2; authored = false; draw(performance.now(), 4);
      return;
    }
    t0 = performance.now(); wake(300);
  }

  // ---- hands
  function pos(e) { var r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }; }
  var prev = null;
  band.addEventListener('pointermove', function (e) {
    if (reduce) return;
    var p = pos(e);
    if (prev) {
      var dx = p.x - prev.x, dy = p.y - prev.y;
      if (Math.abs(dx) + Math.abs(dy) > 0.0005) { authored = false; splat(p.x, 1 - p.y, dx * simW * 10, -dy * simH * 10, 0.0045); wake(2600); }
    }
    prev = p;
  }, { passive: true });
  band.addEventListener('pointerleave', function () { prev = null; });

  var ro = new ResizeObserver(function () { resize(); if (!raf) draw(performance.now(), 4); });
  ro.observe(host);
  new IntersectionObserver(function (en) { visible = en[0].isIntersecting; if (visible && (queue.length || performance.now() < activeUntil)) wake(0); }).observe(host);
  canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); fallback(); });

  try { begin(); } catch (e) { fallback(); }
})();
