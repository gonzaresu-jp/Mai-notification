<?php
// staging-gate.php - stagingサイト全体のログインゲート
// nginx auth_request 用: admin_sessions (staging DB, data-test.db) の
// adminToken Cookie を検証し、有効なら 204 / 無効なら 401 を返す。
// nginx 側は 401 → /admin/login.html へリダイレクト。

declare(strict_types=1);

function fail(): void {
    http_response_code(401);
    exit;
}

// リクエストパスの許可判定は nginx 側で行い、ここでは Cookie だけ検証する
$token = $_COOKIE['adminToken'] ?? '';
if (!is_string($token) || $token === '' || strlen($token) > 128 || !preg_match('/^[a-f0-9]+$/i', $token))
 {
    http_response_code(401);
    exit;
}

$dbPath = '/home/yuzuki/mai-push-test/data-test.db';
if (!is_readable($dbPath)) {
    http_response_code(500);
    exit('staging db not readable');
}
try {
    $pdo = new PDO('sqlite:' . $dbPath, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $hash = hash('sha256', $token);
    $stmt = $pdo->prepare('SELECT username, expires_at FROM admin_sessions WHERE token_hash = ?');
    $stmt->execute([$hash]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
} catch (Throwable $e) {
    http_response_code(500);
    exit('gate error');
}

if (!$row || (int)$row['expires_at'] <= (time() * 1000)) {
    http_response_code(401);
    exit;
}

http_response_code(204);
exit;
