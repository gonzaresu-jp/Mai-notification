<!doctype html>
<html lang="ja">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>テスト完了！</title>
    <link rel="icon" href="/icon.webp">
    <link rel="stylesheet" href="/style.v2.0.css" />

    <script src="https://unpkg.com/@lottiefiles/lottie-player@2.0.2/dist/lottie-player.js"></script>
<style type="text/css">
    /* 非表示にするためのクラス */
.hidden {
  display: none!important;
}

/* 表示を制御するコンテナ */
#animation-container,
#animation-container-other {display: flex; justify-content: flex-end; align-items: flex-start; width: 100%; height: 90vh;}
</style>
</head>
<body id="app-body">
    <div id="header-slot">
        <?php include __DIR__ . '/header.html'; ?>
    </div>

    <main style="padding-right: 0; padding-left: 0;">
        <div id="animation-container">
            </div>

<div id="animation-container-other">
    <picture>
        <source srcset="https://mai.honna-yuzuki.com/mai.avif" type="image/avif">
        <source srcset="mai.png" type="image/png">
        <img src="mai.gif" alt="透過アニメーション">
    </picture>
</div>

        <a href="/" 
            style="text-decoration:none; color:inherit; display:block;">
            <div style="
                background-color:#FFF;
                margin:40px;
                min-height:60px;
                display:flex;
                align-items:center;
                justify-content:center;
                padding:10px 20px;">
                <h3 style="margin:0;">通知ダッシュボードに戻る</h3>
            </div>
        </a>
    </main>

    <div id="footer-slot">
        <?php include __DIR__ . '/footer.html'; ?>
    </div>
<script>
    document.addEventListener('DOMContentLoaded', function() {
  const appleContainer = document.getElementById('animation-container');
  const otherContainer = document.getElementById('animation-container-other');

  // ユーザーエージェント文字列を取得
  const userAgent = navigator.userAgent.toLowerCase();

  // 判定フラグ
  let isAppleDevice = false;

  // Apple製品の一般的なUser Agentに含まれる文字列をチェック
  // 例: 'iphone', 'ipad', 'ipod', 'macintosh' (Mac)
  if (userAgent.includes('iphone') || 
      userAgent.includes('ipad') || 
      userAgent.includes('ipod') || 
      userAgent.includes('macintosh')) {
    isAppleDevice = true;
  }

  if (isAppleDevice) {
    // 🍎 Appleデバイスの場合
    
    // animation-container を表示
    appleContainer.classList.remove('hidden');
    
    // animation-container-other を非表示
    otherContainer.classList.add('hidden');
    
    console.log('Appleデバイスを検出しました。Appleコンテナを表示します。');

  } else {
    // 🤖 その他のデバイスの場合
    
    // animation-container を非表示
    appleContainer.classList.add('hidden');
    
    // animation-container-other を表示
    otherContainer.classList.remove('hidden');
    
    console.log('その他のデバイスを検出しました。Otherコンテナを表示します。');
  }
});
</script>
<script>
// ====================================================================
// WebGLコントローラークラス (提供されたコードを移植)
// WebGLの初期化、シェーダーのコンパイル、バッファの作成を担当
// ====================================================================
class WebGLController {
    constructor(gl) {
        this.gl = gl;
    }

    // シェーダを生成する関数
    createShader(type, source) {
        const gl = this.gl;
        let shader;

        switch (type) {
            case "vertex":
                shader = gl.createShader(gl.VERTEX_SHADER);
                break;
            case "fragment":
                shader = gl.createShader(gl.FRAGMENT_SHADER);
                break;
            default:
                return null;
        }

        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            return shader;
        } else {
            console.error("シェーダーコンパイルエラー:", gl.getShaderInfoLog(shader));
            alert("シェーダーのコンパイルに失敗しました。コンソールを確認してください。");
            return null;
        }
    }

    // プログラムオブジェクトを生成しシェーダをリンクする関数
    createProgram(vertexShader, fragmentShader) {
        const gl = this.gl;
        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        if (gl.getProgramParameter(program, gl.LINK_STATUS)) {
            gl.useProgram(program);
            return program;
        } else {
            console.error("プログラムリンクエラー:", gl.getProgramInfoLog(program));
            return null;
        }
    }

    // VBO (頂点バッファオブジェクト) を生成する関数
    createVbo(vboArray) {
        const gl = this.gl;
        const vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vboArray), gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        return vbo;
    }

    // テクスチャを初期化・更新する関数
    initTexture(texture) {
        const gl = this.gl;
        gl.bindTexture(gl.TEXTURE_2D, texture);
        // テクスチャパラメータ設定 (動画を扱うための定型処理)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    }

    updateTexture(video) {
        const gl = this.gl;
        const level = 0;
        const internalFormat = gl.RGBA;
        const srcFormat = gl.RGBA;
        const srcType = gl.UNSIGNED_BYTE;
        gl.texImage2D(gl.TEXTURE_2D, level, internalFormat, srcFormat, srcType, video);
    }
}

// ====================================================================
// GLSL シェーダーコード
// ====================================================================

// 頂点シェーダー (画面全体を覆う四角形を定義)
const vsSource = `
    attribute vec4 a_position;
    attribute vec2 a_texCoord;
    varying vec2 v_texCoord;
    void main() {
        gl_Position = a_position;
        v_texCoord = a_texCoord;
    }
`;

const fsSource = `
    // 精度宣言
    precision mediump float; 
    
    // Varying変数
    varying vec2 v_texCoord;
    
    // Uniform変数 (今回は u_keyColor, u_threshold, u_smoothness は使用しないが、プログラム互換性のため残す)
    uniform sampler2D u_image;
    uniform vec3 u_keyColor;    
    uniform float u_threshold;  
    uniform float u_smoothness; 

    // 定数を定義
    const vec3 u_despillColor = vec3(0.2, 0.2, 0.2); 
    const float GREEN_DOMINANCE_FACTOR = 0.7; 
    const float MIN_GREEN_VALUE = 0.4;
    const float DESPILL_STRENGTH = 3.0;
    
    const float MAX_ALPHA_THRESHOLD = 0.7;
    const float NOISE_ALPHA_THRESHOLD = 0.4;
    const float COLOR_STRENGTH_THRESHOLD = 0.4;

    void main() {
        vec4 color = texture2D(u_image, v_texCoord);
        vec3 rgb = color.rgb;
        
        float alpha = 1.0; // デフォルトは不透明

        // --- 💡 1. 新しいRBG絶対値による透過判定 ---
        const float R_MAX = 0.6;
        const float B_MAX = 0.6;
        const float G_MIN = 0.4;
        const float ALPHA_SMOOTHNESS = 0.05; // 透過の境界の滑らかさ (0.0が最も鋭い)

        // R, B, Gの条件を満たすかどうか
        bool condition_met = (rgb.r <= R_MAX) && 
                             (rgb.b <= B_MAX) && 
                             (rgb.g >= G_MIN);

        if (condition_met) {
            // 条件を満たした場合、透過を適用
            // G成分が G_MIN から G_MIN + ALPHA_SMOOTHNESS の範囲で、アルファを 1.0 -> 0.0 へ遷移させる
            // Gが高くなるほど（つまり、純粋な緑に近いほど）アルファを下げたい場合は以下のようにロジックを変更
            
            // 透過量 (G成分が G_MIN から離れるほど 1.0 に近づく)
            float g_diff = rgb.g - G_MIN;
            
            // smoothstepを使って、GがG_MIN付近で0.0に、GがG_MIN+SMOOTHNESSで1.0になるように補間
            // 透過させる (alpha = 0.0)
            alpha = 1.0 - smoothstep(0.0, ALPHA_SMOOTHNESS, g_diff);
            
        } else {
            // 条件を満たさなかった場合、完全に不透明 (alpha = 1.0)
            alpha = 1.0;
        }


        // --- 2. 強化デスピル処理 (そのまま残す) ---
        vec3 finalColor = rgb; 

        if (rgb.g > rgb.r * GREEN_DOMINANCE_FACTOR && 
            rgb.g > rgb.b * GREEN_DOMINANCE_FACTOR && 
            rgb.g > MIN_GREEN_VALUE) {
            
            float despillAmount = rgb.g - max(rgb.r, rgb.b); 
            despillAmount = clamp(despillAmount * DESPILL_STRENGTH, 0.0, 1.0);
            finalColor = mix(finalColor, u_despillColor, despillAmount);
        }

        // 3. 最終的な色とアルファ値を出力
        vec4 finalOutput = vec4(finalColor, alpha);

        // --- 4. アルファ値のクリーンアップ (そのまま残す) ---
        if (finalOutput.a > MAX_ALPHA_THRESHOLD) {
            finalOutput.a = 1.0;
        }
        
        // --- 5. ノイズ除去 (そのまま残す) ---
        if (finalOutput.a < NOISE_ALPHA_THRESHOLD && 
            (finalOutput.r + finalOutput.g + finalOutput.b) > COLOR_STRENGTH_THRESHOLD) {
            
            finalOutput.a = 0.0;
        }

        gl_FragColor = finalOutput;
    }
`;

// ====================================================================
// メイン処理
// ====================================================================

window.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('animation-container');
    
    // 1. CanvasとVideo要素を作成
    const canvas = document.createElement('canvas');
    canvas.id = 'animation-canvas';
    canvas.style.height = '90vh';
    canvas.style.width = 'auto';
    canvas.style.display = 'block';

    const video = document.createElement('video');
    video.id = 'video-source';
    video.src = 'https://mai.honna-yuzuki.com/showmai.mp4';
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.style.display = 'none'; 

    // コンテナに追加
    container.appendChild(canvas);
    container.appendChild(video);

    const gl = canvas.getContext('webgl', { premultipliedAlpha: false }); // WebGLコンテキストを取得
    if (!gl) {
        console.error('WebGL not supported.');
        alert('お使いのブラウザはWebGLをサポートしていません。');
        return;
    }

    const controller = new WebGLController(gl);

    // 2. シェーダーをコンパイルし、プログラムをリンク
    const vShader = controller.createShader("vertex", vsSource);
    const fShader = controller.createShader("fragment", fsSource);
    const program = controller.createProgram(vShader, fShader);

    if (!program) return;

    // 3. 頂点情報 (画面全体を覆う四角形) のセットアップ
    const positionAttributeLocation = gl.getAttribLocation(program, 'a_position');
    const texCoordAttributeLocation = gl.getAttribLocation(program, 'a_texCoord');

    // 頂点データ: 画面全体を覆う四角形 (-1.0 to 1.0)
    const positions = [-1.0, -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, 1.0];
    const texCoords = [0.0, 1.0, 1.0, 1.0, 0.0, 0.0, 1.0, 0.0];

    const positionVbo = controller.createVbo(positions);
    const texCoordVbo = controller.createVbo(texCoords);

    // VBOを有効化
    gl.enableVertexAttribArray(positionAttributeLocation);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionVbo);
    gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);

    gl.enableVertexAttribArray(texCoordAttributeLocation);
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordVbo);
    gl.vertexAttribPointer(texCoordAttributeLocation, 2, gl.FLOAT, false, 0, 0);

    // 4. テクスチャと Uniform 変数のセットアップ
    const texture = gl.createTexture();
    controller.initTexture(texture);
    gl.uniform1i(gl.getUniformLocation(program, 'u_image'), 0); // テクスチャユニット0を使用

    const keyColorLocation = gl.getUniformLocation(program, 'u_keyColor');
    const thresholdLocation = gl.getUniformLocation(program, 'u_threshold');
    const smoothnessLocation = gl.getUniformLocation(program, 'u_smoothness');

    // 💡 クロマキー設定の初期値 (0.0-1.0 に正規化)
    // RGB(0, 175, 0) を使用 (G=175/255 ≈ 0.686)
    const KEY_COLOR_GL = [0.0, 255.0 / 255.0, 0.0]; 
    const THRESHOLD_GL = 0.4; // 許容距離 (この値より近い色が消え始める)
    const SMOOTHNESS_GL = 0.7; // 滑らかさ (この値の範囲で半透明のグラデーションが適用される)

    gl.uniform3fv(keyColorLocation, new Float32Array(KEY_COLOR_GL));
    gl.uniform1f(thresholdLocation, THRESHOLD_GL);
    gl.uniform1f(smoothnessLocation, SMOOTHNESS_GL);
    
    // 透過処理の有効化
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // --- 描画ループ ---
    video.onloadeddata = () => {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

        video.play().catch(error => console.error("動画の再生に失敗しました:", error));
        requestAnimationFrame(drawLoop);
    };

    video.onerror = (e) => {
        console.error("動画の読み込み中にエラーが発生しました:", e);
    };

    function drawLoop() {
        if (video.paused || video.ended) {
            requestAnimationFrame(drawLoop);
            return;
        }

        // 1. フレームをテクスチャにアップロード
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        controller.updateTexture(video);

        // 2. 描画
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        requestAnimationFrame(drawLoop);
    }

    video.load();
});
</script>
<!-- iOS Helper を main.js より先に読み込む -->
    <script src="/ios-helper.js" defer></script>
    <script type="module" src="/js/main.js" defer></script>
    <script>
const btn = document.getElementById('btn-log-settings');
const menu = document.getElementById('log-settings-container');

btn.addEventListener('click', () => {
  const open = menu.classList.toggle('is-open');
  btn.setAttribute('aria-expanded', open);
  menu.setAttribute('aria-hidden', !open);
});

// メニュー外クリックで閉じる
document.addEventListener('click', (e) => {
  if (!btn.contains(e.target) && !menu.contains(e.target)) {
    menu.classList.remove('is-open');
    btn.setAttribute('aria-expanded', false);
    menu.setAttribute('aria-hidden', true);
  }
});

</script>

<script>
function initOshiDays() {
  const STORAGE_KEY = "maistart_date";
  const DEFAULT_DATE = "2020-01-07";
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  const dateInput = document.getElementById("start");              // header内
  const meetValueEl = document.getElementById("days-to-meet");     // main内
  const meetStatItem = meetValueEl?.closest(".stat-item");

  if (!meetValueEl || !meetStatItem) return; // 表示側がないなら何もしない
  if (!dateInput) return;                    // headerが未挿入なら何もしない（待つ側で保証する）

  function parseYMD(ymd) {
    if (!ymd) return null;
    const parts = ymd.split("-").map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
    return new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
  }
  function stripTime(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  }
  function daysSinceLocal(date) {
    const now = stripTime(new Date()).getTime();
    const then = stripTime(date).getTime();
    return Math.max(0, Math.floor((now - then) / MS_PER_DAY));
  }

  function loadAndApply() {
    const stored = localStorage.getItem(STORAGE_KEY);
    let effective = stored || dateInput.value || null;

    // DEFAULT_DATE を「未設定扱い」
    if (!effective || effective === DEFAULT_DATE) {
      meetStatItem.style.display = "none";
      meetValueEl.textContent = "0 日";
      if (!stored) dateInput.value = "";
      return;
    }

    const parsed = parseYMD(effective);
    if (!parsed) {
      meetStatItem.style.display = "none";
      return;
    }

    const since = daysSinceLocal(parsed);
    meetValueEl.textContent = `${since} 日`;
    meetStatItem.style.display = "";
    if (dateInput.value !== effective) dateInput.value = effective;
  }

  function saveDate(value) {
    if (!value || value === DEFAULT_DATE) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, value);
    loadAndApply();
  }

  // 多重登録防止
  if (dateInput.dataset.boundOshiDays === "1") {
    loadAndApply();
    return;
  }
  dateInput.dataset.boundOshiDays = "1";

  loadAndApply();
  dateInput.addEventListener("change", (e) => saveDate(e.target.value));

  // 「保存」ボタン（ユーザー名保存と共用）でも保存したいなら
  const saveBtn = document.getElementById("subscriber-name-submit");
  if (saveBtn && !saveBtn.dataset.boundOshiDays) {
    saveBtn.dataset.boundOshiDays = "1";
    saveBtn.addEventListener("click", () => saveDate(dateInput.value));
  }

  // 日付跨ぎ対策
  setInterval(loadAndApply, 60 * 1000);
}


(async () => {
  const load = async (id, url) => {
    const el = document.getElementById(id);
    if (!el) return;
    const res = await fetch(url, { cache: 'no-cache' });
    el.innerHTML = await res.text();
  };

  await load('header-slot', '/header.html');
  initOshiDays();               // ← ここが重要：header 注入後に初期化
  await load('footer-slot', '/footer.html');
})();
</script>
<script>
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./service-worker.js')
            .then(reg => console.log('Service Worker 登録成功', reg))
            .catch(err => console.error('Service Worker 登録失敗', err));
    }

// 1. フェードイン用関数（定義するだけ。ロード時は呼ばない）
    function applyHamburgerSequentialFadeIn() {
        const menuItems = document.querySelectorAll('#nav-menu > .nav-list > li');
        const delayIncrement = 100; 

        menuItems.forEach((item, index) => {
            const delay = index * delayIncrement;
            setTimeout(() => {
                item.classList.add('is-faded-in');
            }, delay);
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
    const body = document.getElementById('app-body');

    // 1) 初期はトランジション無効（bodyに class を付けておく）
    //    ここでは最小遅延で「初回描画を挟んで」トランジションを有効にする。
    requestAnimationFrame(() => {
        // 1フレーム待ってからさらに次フレームで class を除去 → トランジションが発火するのは以降の操作だけ
        requestAnimationFrame(() => {
            body.classList.remove('menu-transitions-disabled');
        });
    });

    // --- 以下は既存の初期化処理（メニュー初期化等） ---
    const toggle = document.getElementById('hamburger-toggle');
    const overlay = document.getElementById('menu-overlay');
    const notifyToggle = document.getElementById('toggle-notify');

    // メニュー項目集合
    const menuItems = document.querySelectorAll('#nav-menu > .nav-list > li');
    // 初期状態として is-faded-in を外しておく（念のため）
    menuItems.forEach(item => item.classList.remove('is-faded-in'));

    function applyHamburgerSequentialFadeIn() {
        const delayIncrement = 100;
        menuItems.forEach((item, index) => {
            const delay = index * delayIncrement;
            setTimeout(() => {
                item.classList.add('is-faded-in');
            }, delay);
        });
    }

    function toggleMenu(isOpen) {
        if (isOpen) {
            // 開くときはまずクラスを外して確実に 0 → 1 の遷移が発生するように
            menuItems.forEach(item => item.classList.remove('is-faded-in'));

            body.classList.add('menu-open');
            toggle.setAttribute('aria-expanded', 'true');
            overlay.style.display = 'block';

            // スライド等の外枠アニメーションがあるなら遅延（既定値の 300ms 等）
            setTimeout(() => applyHamburgerSequentialFadeIn(), 300);
        } else {
            body.classList.remove('menu-open');
            toggle.setAttribute('aria-expanded', 'false');
            overlay.style.display = 'none';
            menuItems.forEach(item => item.classList.remove('is-faded-in'));
        }
    }

    // --- 右端スワイプでメニュー開閉 ---
// 挿入場所: document.addEventListener('DOMContentLoaded', ...) 内、toggleMenu 定義の直後
(function installRightEdgeSwipeMenu() {
    const EDGE_START = 270;
    const OPEN_THRESHOLD = 60;
    const CLOSE_THRESHOLD = 60;
    const MAX_VERTICAL_DELTA = 30;
    let pointerActive = false;
    let startX = 0, startY = 0;
    let trackingForOpen = false;
    let trackingForClose = false;

    function isMenuOpen() {
        return document.body.classList.contains('menu-open');
    }

    function onPointerDown(e) {
        const x = e.clientX || (e.touches && e.touches[0].clientX);
        const y = e.clientY || (e.touches && e.touches[0].clientY);

        startX = x; startY = y;
        pointerActive = true;
        trackingForOpen = false;
        trackingForClose = false;

        if (!isMenuOpen() && startX >= (window.innerWidth - EDGE_START)) {
            trackingForOpen = true;
        }

        if (isMenuOpen()) {
            const menu = document.getElementById('nav-menu');
            const overlay = document.getElementById('menu-overlay');
            const target = e.target || (e.touches && e.touches[0].target);
            
            if (overlay && overlay.style.display !== 'none' && overlay.contains(target)) {
                trackingForClose = true;
            } else if (menu) {
                const r = menu.getBoundingClientRect();
                if (startX >= r.left && startX <= r.right && startY >= r.top && startY <= r.bottom) {
                    trackingForClose = true;
                }
            }
        }
    }

    function onPointerMove(e) {
        if (!pointerActive) return;
        
        const x = e.clientX || (e.touches && e.touches[0].clientX);
        const y = e.clientY || (e.touches && e.touches[0].clientY);
        const dx = x - startX;
        const dy = y - startY;

        if (Math.abs(dy) > MAX_VERTICAL_DELTA) {
            trackingForOpen = false;
            trackingForClose = false;
            return;
        }

        if (trackingForOpen && dx < -OPEN_THRESHOLD) {
            toggleMenu(true);
            trackingForOpen = false;
            pointerActive = false;
            if (e.cancelable) e.preventDefault();
            return;
        }

        if (trackingForClose && dx > CLOSE_THRESHOLD) {
            toggleMenu(false);
            trackingForClose = false;
            pointerActive = false;
            if (e.cancelable) e.preventDefault();
            return;
        }
    }

    function onPointerUp() {
        pointerActive = false;
        trackingForOpen = false;
        trackingForClose = false;
    }

    // タッチデバイス優先で登録
    if ('ontouchstart' in window) {
        // タッチデバイスの場合
        document.addEventListener('touchstart', onPointerDown, { passive: true });
        document.addEventListener('touchmove', onPointerMove, { passive: false }); // passive: false が重要
        document.addEventListener('touchend', onPointerUp, { passive: true });
        document.addEventListener('touchcancel', onPointerUp, { passive: true });
    } else if (window.PointerEvent) {
        // Pointer Events 対応デバイス
        document.addEventListener('pointerdown', onPointerDown, { passive: true });
        document.addEventListener('pointermove', onPointerMove, { passive: false });
        document.addEventListener('pointerup', onPointerUp, { passive: true });
        document.addEventListener('pointercancel', onPointerUp, { passive: true });
    }
})();

    toggle.addEventListener('click', () => {
        const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
        toggleMenu(!isExpanded);
    });
    overlay.addEventListener('click', () => toggleMenu(false));

    if (notifyToggle) {
        function updateToggleImage() {
            if (notifyToggle.checked) body.classList.add('notifications-enabled');
            else body.classList.remove('notifications-enabled');
        }
        notifyToggle.addEventListener('change', updateToggleImage);
        setTimeout(updateToggleImage, 100);
    }
});

</script>
<script type="module">
  window.__layoutReady = (async () => {
    const load = async (id, url) => {
      const el = document.getElementById(id);
      if (!el) return;
      const res = await fetch(url, { cache: 'no-cache' });
      el.innerHTML = await res.text();
    };

    await load('header-slot', '/header.html');
    window.initHeader?.();
    await load('footer-slot', '/footer.html');
  })();
</script>
<!-- iOS Helper を main.js より先に読み込む -->
    <script src="/ios-helper.js" defer></script>
    <script type="module" src="/js/main.js" defer></script>
    <script>
const btn = document.getElementById('btn-log-settings');
const menu = document.getElementById('log-settings-container');

btn.addEventListener('click', () => {
  const open = menu.classList.toggle('is-open');
  btn.setAttribute('aria-expanded', open);
  menu.setAttribute('aria-hidden', !open);
});

// メニュー外クリックで閉じる
document.addEventListener('click', (e) => {
  if (!btn.contains(e.target) && !menu.contains(e.target)) {
    menu.classList.remove('is-open');
    btn.setAttribute('aria-expanded', false);
    menu.setAttribute('aria-hidden', true);
  }
});

</script>

<script>
function initOshiDays() {
  const STORAGE_KEY = "maistart_date";
  const DEFAULT_DATE = "2020-01-07";
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  const dateInput = document.getElementById("start");              // header内
  const meetValueEl = document.getElementById("days-to-meet");     // main内
  const meetStatItem = meetValueEl?.closest(".stat-item");

  if (!meetValueEl || !meetStatItem) return; // 表示側がないなら何もしない
  if (!dateInput) return;                    // headerが未挿入なら何もしない（待つ側で保証する）

  function parseYMD(ymd) {
    if (!ymd) return null;
    const parts = ymd.split("-").map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
    return new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
  }
  function stripTime(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  }
  function daysSinceLocal(date) {
    const now = stripTime(new Date()).getTime();
    const then = stripTime(date).getTime();
    return Math.max(0, Math.floor((now - then) / MS_PER_DAY));
  }

  function loadAndApply() {
    const stored = localStorage.getItem(STORAGE_KEY);
    let effective = stored || dateInput.value || null;

    // DEFAULT_DATE を「未設定扱い」
    if (!effective || effective === DEFAULT_DATE) {
      meetStatItem.style.display = "none";
      meetValueEl.textContent = "0 日";
      if (!stored) dateInput.value = "";
      return;
    }

    const parsed = parseYMD(effective);
    if (!parsed) {
      meetStatItem.style.display = "none";
      return;
    }

    const since = daysSinceLocal(parsed);
    meetValueEl.textContent = `${since} 日`;
    meetStatItem.style.display = "";
    if (dateInput.value !== effective) dateInput.value = effective;
  }

  function saveDate(value) {
    if (!value || value === DEFAULT_DATE) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, value);
    loadAndApply();
  }

  // 多重登録防止
  if (dateInput.dataset.boundOshiDays === "1") {
    loadAndApply();
    return;
  }
  dateInput.dataset.boundOshiDays = "1";

  loadAndApply();
  dateInput.addEventListener("change", (e) => saveDate(e.target.value));

  // 「保存」ボタン（ユーザー名保存と共用）でも保存したいなら
  const saveBtn = document.getElementById("subscriber-name-submit");
  if (saveBtn && !saveBtn.dataset.boundOshiDays) {
    saveBtn.dataset.boundOshiDays = "1";
    saveBtn.addEventListener("click", () => saveDate(dateInput.value));
  }

  // 日付跨ぎ対策
  setInterval(loadAndApply, 60 * 1000);
}


(async () => {
  const load = async (id, url) => {
    const el = document.getElementById(id);
    if (!el) return;
    const res = await fetch(url, { cache: 'no-cache' });
    el.innerHTML = await res.text();
  };
})();
</script>
<script>
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./service-worker.js')
            .then(reg => console.log('Service Worker 登録成功', reg))
            .catch(err => console.error('Service Worker 登録失敗', err));
    }

// 1. フェードイン用関数（定義するだけ。ロード時は呼ばない）
    function applyHamburgerSequentialFadeIn() {
        const menuItems = document.querySelectorAll('#nav-menu > .nav-list > li');
        const delayIncrement = 100; 

        menuItems.forEach((item, index) => {
            const delay = index * delayIncrement;
            setTimeout(() => {
                item.classList.add('is-faded-in');
            }, delay);
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
    const body = document.getElementById('app-body');

    // 1) 初期はトランジション無効（bodyに class を付けておく）
    //    ここでは最小遅延で「初回描画を挟んで」トランジションを有効にする。
    requestAnimationFrame(() => {
        // 1フレーム待ってからさらに次フレームで class を除去 → トランジションが発火するのは以降の操作だけ
        requestAnimationFrame(() => {
            body.classList.remove('menu-transitions-disabled');
        });
    });

    // --- 以下は既存の初期化処理（メニュー初期化等） ---
    const toggle = document.getElementById('hamburger-toggle');
    const overlay = document.getElementById('menu-overlay');
    const notifyToggle = document.getElementById('toggle-notify');

    // メニュー項目集合
    const menuItems = document.querySelectorAll('#nav-menu > .nav-list > li');
    // 初期状態として is-faded-in を外しておく（念のため）
    menuItems.forEach(item => item.classList.remove('is-faded-in'));

    function applyHamburgerSequentialFadeIn() {
        const delayIncrement = 100;
        menuItems.forEach((item, index) => {
            const delay = index * delayIncrement;
            setTimeout(() => {
                item.classList.add('is-faded-in');
            }, delay);
        });
    }

    function toggleMenu(isOpen) {
        if (isOpen) {
            // 開くときはまずクラスを外して確実に 0 → 1 の遷移が発生するように
            menuItems.forEach(item => item.classList.remove('is-faded-in'));

            body.classList.add('menu-open');
            toggle.setAttribute('aria-expanded', 'true');
            overlay.style.display = 'block';

            // スライド等の外枠アニメーションがあるなら遅延（既定値の 300ms 等）
            setTimeout(() => applyHamburgerSequentialFadeIn(), 300);
        } else {
            body.classList.remove('menu-open');
            toggle.setAttribute('aria-expanded', 'false');
            overlay.style.display = 'none';
            menuItems.forEach(item => item.classList.remove('is-faded-in'));
        }
    }

    // --- 右端スワイプでメニュー開閉 ---
// 挿入場所: document.addEventListener('DOMContentLoaded', ...) 内、toggleMenu 定義の直後
(function installRightEdgeSwipeMenu() {
    const EDGE_START = 270;
    const OPEN_THRESHOLD = 60;
    const CLOSE_THRESHOLD = 60;
    const MAX_VERTICAL_DELTA = 30;
    let pointerActive = false;
    let startX = 0, startY = 0;
    let trackingForOpen = false;
    let trackingForClose = false;

    function isMenuOpen() {
        return document.body.classList.contains('menu-open');
    }

    function onPointerDown(e) {
        const x = e.clientX || (e.touches && e.touches[0].clientX);
        const y = e.clientY || (e.touches && e.touches[0].clientY);

        startX = x; startY = y;
        pointerActive = true;
        trackingForOpen = false;
        trackingForClose = false;

        if (!isMenuOpen() && startX >= (window.innerWidth - EDGE_START)) {
            trackingForOpen = true;
        }

        if (isMenuOpen()) {
            const menu = document.getElementById('nav-menu');
            const overlay = document.getElementById('menu-overlay');
            const target = e.target || (e.touches && e.touches[0].target);
            
            if (overlay && overlay.style.display !== 'none' && overlay.contains(target)) {
                trackingForClose = true;
            } else if (menu) {
                const r = menu.getBoundingClientRect();
                if (startX >= r.left && startX <= r.right && startY >= r.top && startY <= r.bottom) {
                    trackingForClose = true;
                }
            }
        }
    }

    function onPointerMove(e) {
        if (!pointerActive) return;
        
        const x = e.clientX || (e.touches && e.touches[0].clientX);
        const y = e.clientY || (e.touches && e.touches[0].clientY);
        const dx = x - startX;
        const dy = y - startY;

        if (Math.abs(dy) > MAX_VERTICAL_DELTA) {
            trackingForOpen = false;
            trackingForClose = false;
            return;
        }

        if (trackingForOpen && dx < -OPEN_THRESHOLD) {
            toggleMenu(true);
            trackingForOpen = false;
            pointerActive = false;
            if (e.cancelable) e.preventDefault();
            return;
        }

        if (trackingForClose && dx > CLOSE_THRESHOLD) {
            toggleMenu(false);
            trackingForClose = false;
            pointerActive = false;
            if (e.cancelable) e.preventDefault();
            return;
        }
    }

    function onPointerUp() {
        pointerActive = false;
        trackingForOpen = false;
        trackingForClose = false;
    }

    // タッチデバイス優先で登録
    if ('ontouchstart' in window) {
        // タッチデバイスの場合
        document.addEventListener('touchstart', onPointerDown, { passive: true });
        document.addEventListener('touchmove', onPointerMove, { passive: false }); // passive: false が重要
        document.addEventListener('touchend', onPointerUp, { passive: true });
        document.addEventListener('touchcancel', onPointerUp, { passive: true });
    } else if (window.PointerEvent) {
        // Pointer Events 対応デバイス
        document.addEventListener('pointerdown', onPointerDown, { passive: true });
        document.addEventListener('pointermove', onPointerMove, { passive: false });
        document.addEventListener('pointerup', onPointerUp, { passive: true });
        document.addEventListener('pointercancel', onPointerUp, { passive: true });
    }
})();

    toggle.addEventListener('click', () => {
        const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
        toggleMenu(!isExpanded);
    });
    overlay.addEventListener('click', () => toggleMenu(false));

    if (notifyToggle) {
        function updateToggleImage() {
            if (notifyToggle.checked) body.classList.add('notifications-enabled');
            else body.classList.remove('notifications-enabled');
        }
        notifyToggle.addEventListener('change', updateToggleImage);
        setTimeout(updateToggleImage, 100);
    }
});

</script>
</body>
</html>