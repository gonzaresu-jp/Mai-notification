
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
    