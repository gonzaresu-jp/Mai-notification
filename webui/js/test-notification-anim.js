
        document.addEventListener('DOMContentLoaded', function () {
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
    