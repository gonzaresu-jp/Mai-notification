<?php
/**
 * ドメインの単一ソース（リクエストから導出）。
 * ドメイン移行時も本ファイルの修正不要 — Host / X-Forwarded-Proto に自動追従する。
 *  override したい場合のみ $domain を先に定義してから require すること。
 */
if (!isset($domain)) {
    $fwd = strtolower($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '');
    $isHttps = ($fwd === 'https') || (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
    $proto = $isHttps ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? 'mai.honna-yuzuki.com';
    $domain = $proto . '://' . $host;
}
if (!isset($defaultImage)) {
    $defaultImage = $domain . '/social.jpg';
}
