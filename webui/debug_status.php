<?php
$db = new SQLite3(__DIR__ . '/data.db');
$res = $db->query("SELECT * FROM scraper_status");
$rows = [];
while ($row = $res->fetchArray(SQLITE3_ASSOC)) {
    $rows[] = $row;
}
echo json_encode($rows, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
?>
