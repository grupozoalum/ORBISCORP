<?php
date_default_timezone_set('America/Mexico_City');

// ─────────────────────────────────────────────────────────────
//  CONFIGURACIÓN FIREBASE Y CABECERAS
// ─────────────────────────────────────────────────────────────
if (!isset($_GET['ajax']) && !isset($_GET['export']) && !isset($_GET['write'])) {
    header('Content-Type: text/html; charset=utf-8');
}

$PROJECT_ID = "lazia-a0282";
$API_KEY    = "AIzaSyCA39OXCBTlE0wWFgZ6BBluaQVqqRkimAs";

// ─── Firestore READ ───────────────────────────────────────────
function firestoreGetCollection(string $projectId, string $apiKey, string $collection): array {
    $url  = "https://firestore.googleapis.com/v1/projects/{$projectId}/databases/(default)/documents/{$collection}?key={$apiKey}&pageSize=500";
    $docs = [];
    $nextPage = $url;
    while ($nextPage) {
        $ch = curl_init($nextPage);
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15, CURLOPT_HTTPHEADER => ["Content-Type: application/json"]]);
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($httpCode !== 200 || !$response) break;
        $data = json_decode($response, true);
        if (!isset($data['documents'])) break;
        foreach ($data['documents'] as $doc) {
            $id = basename($doc['name']);
            $fields = parseFirestoreFields($doc['fields'] ?? []);
            $fields['_id'] = $id;
            $docs[] = $fields;
        }
        $nextPage = isset($data['nextPageToken']) ? $url . "&pageToken=" . urlencode($data['nextPageToken']) : null;
    }
    return $docs;
}

// ─── Firestore PATCH (escritura parcial) ──────────────────────
function firestoreUpdateDoc(string $projectId, string $apiKey, string $collection, string $docId, array $fields): bool {
    $body = ['fields' => []];
    foreach ($fields as $k => $v) {
        if (is_string($v))  $body['fields'][$k] = ['stringValue' => $v];
        elseif (is_int($v)) $body['fields'][$k] = ['integerValue' => $v];
        elseif (is_bool($v)) $body['fields'][$k] = ['booleanValue' => $v];
    }
    $updateMask = implode('&updateMask.fieldPaths=', array_keys($fields));
    $url = "https://firestore.googleapis.com/v1/projects/{$projectId}/databases/(default)/documents/{$collection}/{$docId}?key={$apiKey}&updateMask.fieldPaths={$updateMask}";
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST  => 'PATCH',
        CURLOPT_POSTFIELDS     => json_encode($body),
        CURLOPT_TIMEOUT        => 10,
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
    ]);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return $httpCode === 200;
}

function parseFirestoreFields(array $fields): array {
    $out = [];
    foreach ($fields as $key => $val) { $out[$key] = parseFirestoreValue($val); }
    return $out;
}
function parseFirestoreValue(array $val): mixed {
    if (isset($val['stringValue']))    return $val['stringValue'];
    if (isset($val['integerValue']))   return (int)   $val['integerValue'];
    if (isset($val['doubleValue']))    return (float) $val['doubleValue'];
    if (isset($val['booleanValue']))   return (bool)  $val['booleanValue'];
    if (isset($val['nullValue']))      return null;
    if (isset($val['timestampValue'])) return $val['timestampValue'];
    if (isset($val['mapValue']))       return parseFirestoreFields($val['mapValue']['fields'] ?? []);
    if (isset($val['arrayValue']))     return array_map('parseFirestoreValue', $val['arrayValue']['values'] ?? []);
    return null;
}

// ─────────────────────────────────────────────────────────────
//  ENDPOINT ESCRITURA (estado + nota) + INVALIDACIÓN DE CACHÉ
// ─────────────────────────────────────────────────────────────
if (isset($_GET['write']) && $_GET['write'] === 'true') {
    header('Content-Type: application/json; charset=utf-8');
    $docId  = trim($_POST['id']    ?? '');
    $estado = trim($_POST['estado'] ?? '');
    $nota   = trim($_POST['nota']   ?? '');
    if (!$docId) { echo json_encode(['ok' => false, 'error' => 'id requerido']); exit; }
    
    $updates = [];
    if ($estado) $updates['estado'] = $estado;
    if ($nota !== '') $updates['nota'] = $nota;
    if (empty($updates)) { echo json_encode(['ok' => true]); exit; }
    
    $ok = firestoreUpdateDoc($PROJECT_ID, $API_KEY, 'reportes_transporte', $docId, $updates);
    
    // Si la escritura fue exitosa, borramos el caché para forzar lectura fresca
    if ($ok) {
        $cacheFile = __DIR__ . '/cache_stats.json';
        if (file_exists($cacheFile)) {
            unlink($cacheFile);
        }
    }
    
    echo json_encode(['ok' => $ok]);
    exit;
}
// ─────────────────────────────────────────────────────────────
//  ENDPOINT LIMPIAR CACHÉ MANUAL
// ─────────────────────────────────────────────────────────────
if (isset($_GET['force_refresh'])) {
    $cacheFile = __DIR__ . '/cache_stats.json';
    if (file_exists($cacheFile)) unlink($cacheFile);
    echo json_encode(['ok' => true]);
    exit;
}
// ─────────────────────────────────────────────────────────────
//  CACHÉ (Base global para los endpoints de lectura)
// ─────────────────────────────────────────────────────────────
$error = null; $reportes = [];
$cacheFile = __DIR__ . '/cache_stats.json';
$cacheTime = 15;
try {
    if (!file_exists($cacheFile) || (time() - filemtime($cacheFile)) > $cacheTime) {
        $reportes = firestoreGetCollection($PROJECT_ID, $API_KEY, "reportes_transporte");
        usort($reportes, fn($a, $b) => strtotime($b['fechaEnvio'] ?? '0') <=> strtotime($a['fechaEnvio'] ?? '0'));
        file_put_contents($cacheFile, json_encode($reportes));
    } else {
        $reportes = json_decode(file_get_contents($cacheFile), true);
    }
} catch (Exception $e) {
    $error = $e->getMessage();
    if (file_exists($cacheFile)) $reportes = json_decode(file_get_contents($cacheFile), true);
}

// ─────────────────────────────────────────────────────────────
//  ENDPOINT AJAX TABLA (con filtro de estado)
// ─────────────────────────────────────────────────────────────
if (isset($_GET['ajax']) && $_GET['ajax'] === 'true') {
    header('Content-Type: application/json; charset=utf-8');
    $q       = strtolower(trim($_GET['q']      ?? ''));
    $rango   = trim($_GET['fecha']             ?? '');
    $fEstado = trim($_GET['estado']            ?? '');
    $fTipo   = trim($_GET['tipo']              ?? '');
    $pagina  = max(1, (int)($_GET['pag']       ?? 1));
    $perPage = 15;

    $all = $reportes; // Usar el array ya procesado
    $filtered = $all;

    if ($rango && strpos($rango, ' to ') !== false) {
        [$fInicio, $fFin] = explode(' to ', $rango);
        $filtered = array_filter($filtered, function($r) use ($fInicio, $fFin) {
            $fecha = substr($r['fechaEnvio'] ?? '', 0, 10);
            return $fecha >= $fInicio && $fecha <= $fFin;
        });
    }
    if ($fEstado) {
        $filtered = array_filter($filtered, fn($r) => ($r['estado'] ?? 'Pendiente') === $fEstado);
    }
    if ($fTipo) {
        $filtered = array_filter($filtered, fn($r) => ($r['tipo'] ?? '') === $fTipo);
    }
    if ($q) {
        $filtered = array_filter($filtered, fn($r) =>
            strpos(strtolower(implode(' ', [$r['descripcion']??'', $r['usuario']??'', $r['unidadLabel']??'', $r['tipo']??'', $r['nota']??''])), $q) !== false
        );
    }

    $filtered   = array_values($filtered);
    $totalFilt  = count($filtered);
    $slice      = array_slice($filtered, ($pagina - 1) * $perPage, $perPage);

    // Stats en tiempo real para miniKPIs de la tabla/sidebar
    $criticalTypes = ['Accidente de tránsito', 'Disturbio en la unidad', 'Acoso sexual o tocamiento indebido', 'Acoso sexual en parada o terminal', 'Conflicto o agresión entre usuarios en parada'];
    $stats = [
        'total'      => count($all),
        'criticos'   => count(array_filter($all, fn($r) => in_array($r['tipo'] ?? '', $criticalTypes))),
        'pendientes' => count(array_filter($all, fn($r) => ($r['estado'] ?? 'Pendiente') === 'Pendiente')),
        'enRevision' => count(array_filter($all, fn($r) => ($r['estado'] ?? '') === 'En revisión')),
        'resueltos'  => count(array_filter($all, fn($r) => ($r['estado'] ?? '') === 'Resuelto')),
        'hoy'        => count(array_filter($all, fn($r) => str_starts_with($r['fechaEnvio'] ?? '', date('Y-m-d')))),
    ];

    echo json_encode(['data' => $slice, 'total' => $totalFilt, 'pages' => max(1, (int)ceil($totalFilt / $perPage)), 'stats' => $stats]);
    exit;
}

// ─────────────────────────────────────────────────────────────
//  ENDPOINT AJAX DASHBOARD (Gráficas siempre al día)
// ─────────────────────────────────────────────────────────────
if (isset($_GET['ajax']) && $_GET['ajax'] === 'dashboard') {
    header('Content-Type: application/json; charset=utf-8');
    
    $TIPOS_CRITICOS = ['Accidente de tránsito', 'Disturbio en la unidad', 'Acoso sexual o tocamiento indebido', 'Acoso sexual en parada o terminal', 'Conflicto o agresión entre usuarios en parada'];
    
    $totalReportes   = count($reportes);
    $totalCriticos   = count(array_filter($reportes, fn($r) => in_array($r['tipo'] ?? '', $TIPOS_CRITICOS)));
    $totalPendientes = count(array_filter($reportes, fn($r) => ($r['estado'] ?? 'Pendiente') === 'Pendiente'));
    $totalResueltos  = count(array_filter($reportes, fn($r) => ($r['estado'] ?? '') === 'Resuelto'));
    $totalEnRevision = count(array_filter($reportes, fn($r) => ($r['estado'] ?? '') === 'En revisión'));
    $totalDescartados= count(array_filter($reportes, fn($r) => ($r['estado'] ?? '') === 'Descartado'));
    
    $inicioSemana    = date('Y-m-d', strtotime('monday this week'));
    $totalSemana     = count(array_filter($reportes, fn($r) => ($r['fechaEnvio'] ?? '') >= $inicioSemana));

    $porTipo = [];
    foreach ($reportes as $r) { $t = $r['tipo'] ?? 'Sin tipo'; $porTipo[$t] = ($porTipo[$t] ?? 0) + 1; }
    arsort($porTipo);

    $porDia = [];
    for ($i = 6; $i >= 0; $i--) { $dia = date('Y-m-d', strtotime("-{$i} days")); $porDia[$dia] = 0; }
    foreach ($reportes as $r) { $dia = substr($r['fechaEnvio'] ?? '', 0, 10); if (isset($porDia[$dia])) $porDia[$dia]++; }

    $porSemana = [];
    for ($i = 3; $i >= 0; $i--) {
        $lunes  = date('Y-m-d', strtotime("monday -{$i} weeks"));
        $domingo = date('Y-m-d', strtotime("sunday -{$i} weeks"));
        $label  = 'S' . date('W', strtotime($lunes));
        $porSemana[$label] = count(array_filter($reportes, fn($r) => ($r['fechaEnvio'] ?? '') >= $lunes && ($r['fechaEnvio'] ?? '') <= $domingo . ' 23:59:59'));
    }

    $porHora = array_fill(0, 24, 0);
    foreach ($reportes as $r) {
        if (!empty($r['fechaEnvio'])) {
            $h = (int)date('G', strtotime($r['fechaEnvio']));
            $porHora[$h]++;
        }
    }

    $porUnidad = [];
    foreach ($reportes as $r) {
        $u = $r['unidadLabel'] ?? ($r['unidad'] ?? '');
        if ($u && !in_array($u, ['No identificada','N/A – incidente en parada','Parada / Terminal',''])) {
            $porUnidad[$u] = ($porUnidad[$u] ?? 0) + 1;
        }
    }
    arsort($porUnidad);
    $topUnidades = array_slice($porUnidad, 0, 7, true);

    echo json_encode([
        'kpis' => [
            'total'          => $totalReportes,
            'criticos'       => $totalCriticos,
            'pendientes'     => $totalPendientes,
            'resueltos'      => $totalResueltos,
            'semana'         => $totalSemana,
            'resolucionRate' => $totalReportes > 0 ? round($totalResueltos / $totalReportes * 100, 1) : 0,
            'tasaCriticos'   => $totalReportes > 0 ? round($totalCriticos / $totalReportes * 100, 1) : 0,
        ],
        'charts' => [
            'porDia'      => array_values($porDia),
            'diasLabels'  => array_map(fn($d) => date('d/m', strtotime($d)), array_keys($porDia)),
            'tipos5'      => array_keys(array_slice($porTipo, 0, 5, true)),
            'tipos5val'   => array_values(array_slice($porTipo, 0, 5, true)),
            'tiposAll'    => array_keys($porTipo),
            'tiposAllV'   => array_values($porTipo),
            'porHora'     => array_values($porHora),
            'porSemana'   => array_values($porSemana),
            'semLabels'   => array_keys($porSemana),
            'estados'     => [$totalPendientes, $totalEnRevision, $totalResueltos, $totalDescartados],
            'topUnidades' => $topUnidades
        ]
    ]);
    exit;
}

// ─────────────────────────────────────────────────────────────
//  EXPORT CSV
// ─────────────────────────────────────────────────────────────
if (isset($_GET['export'])) {
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="reportes_' . date('Y-m-d') . '.csv"');
    echo "\xEF\xBB\xBF";
    $out = fopen('php://output', 'w');
    fputcsv($out, ['ID','Fecha','Usuario','Tipo','Unidad','Descripción','Estado','Nota']);
    foreach ($reportes as $r) {
        fputcsv($out, [$r['_id'], $r['fechaEnvio']??'', $r['usuario']??'', $r['tipo']??'', $r['unidadLabel']??($r['unidad']??''), $r['descripcion']??'', $r['estado']??'Pendiente', $r['nota']??'']);
    }
    fclose($out);
    exit;
}
?>
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>NOC · Ruta 30</title>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet"/>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css">
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    /* ── TOKENS (LIGHT THEME) ────────────────────────────────── */
    :root {
      --bg:        #f3f5f8;
      --surface:   #ffffff;
      --surface2:  #f8fafc;
      --surface3:  #f1f5f9;
      --border:    #e2e8f0;
      --border2:   #cbd5e1;

      --accent:    #2563eb;
      --accent2:   #1d4ed8;
      --accent-bg: rgba(37,99,235,.10);

      --danger:    #ef4444;
      --danger-bg: rgba(239,68,68,.10);
      --danger-border: rgba(239,68,68,.25);

      --warn:      #f59e0b;
      --warn-bg:   rgba(245,158,11,.10);
      --warn-border: rgba(245,158,11,.25);

      --success:   #10b981;
      --success-bg:rgba(16,185,129,.10);
      --success-border:rgba(16,185,129,.25);

      --violet:    #8b5cf6;
      --violet-bg: rgba(139,92,246,.10);

      --text:      #0f172a;
      --text-muted:#475569;
      --text-dim:  #64748b;

      --mono: 'IBM Plex Mono', monospace;
      --sans: 'Inter', sans-serif;
      --radius: 10px;
      --shadow: 0 4px 15px rgba(0,0,0,.05);
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body  { font-family: var(--sans); background: var(--bg); color: var(--text); min-height: 100vh; }

    /* ── SCROLLBAR ───────────────────────────────────────────── */
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: var(--surface); }
    ::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 3px; }

    /* ── SIDEBAR ─────────────────────────────────────────────── */
    .sidebar {
      position: fixed; top: 0; left: 0; width: 230px; height: 100vh;
      background: var(--surface); border-right: 1px solid var(--border);
      display: flex; flex-direction: column; padding: 20px 14px; z-index: 100;
    }
    .sidebar-logo { display: flex; align-items: center; gap: 12px; margin-bottom: 32px; padding: 0 6px; }
    .logo-icon {
      width: 36px; height: 36px; border-radius: 9px;
      background: linear-gradient(135deg, var(--accent), var(--violet));
      display: flex; align-items: center; justify-content: center;
      font-family: var(--mono); font-size: 12px; font-weight: 600; color: #fff; letter-spacing: -.5px;
    }
    .logo-text { font-weight: 700; font-size: 14px; color: var(--text); letter-spacing: -.3px; }
    .logo-sub  { font-size: 10px; color: var(--text-dim); letter-spacing: 1px; text-transform: uppercase; margin-top: 1px; }

    .nav-section { font-size: 9px; color: var(--text-dim); letter-spacing: 1.5px; text-transform: uppercase; margin: 18px 6px 6px; }
    .nav-item {
      display: flex; align-items: center; gap: 9px; padding: 8px 10px; border-radius: 7px;
      font-size: 13px; font-weight: 500; color: var(--text-muted); text-decoration: none;
      margin-bottom: 2px; transition: all .15s; cursor: pointer; border: none; background: none; width: 100%;
    }
    .nav-item:hover  { background: var(--surface2); color: var(--text); }
    .nav-item.active { background: var(--accent-bg); color: var(--accent2); }
    .nav-item .ni-icon { opacity: .7; flex-shrink: 0; }
    .nav-item.active .ni-icon { opacity: 1; }

    /* Ticker vivo en sidebar */
    .sidebar-live {
      margin: 16px 0 8px; padding: 10px 12px;
      background: var(--surface2); border: 1px solid var(--border2); border-radius: 8px;
    }
    .live-label { font-size: 9px; text-transform: uppercase; letter-spacing: 1.2px; color: var(--text-dim); margin-bottom: 8px; display: flex; align-items: center; gap: 6px; }
    .live-dot   { width: 6px; height: 6px; border-radius: 50%; background: var(--success); animation: pulse 2s infinite; }
    @keyframes pulse { 0%,100%{opacity:1;box-shadow:0 0 0 0 var(--success-border)} 50%{opacity:.7;box-shadow:0 0 0 4px transparent} }
    .ticker-row { display: flex; justify-content: space-between; align-items: center; font-size: 11px; padding: 3px 0; }
    .ticker-label { color: var(--text-muted); }
    .ticker-val   { font-family: var(--mono); font-weight: 600; color: var(--text); }
    .ticker-val.danger  { color: var(--danger); }
    .ticker-val.warn    { color: var(--warn); }
    .ticker-val.success { color: var(--success); }
    .ticker-val.accent  { color: var(--accent); }

    .sidebar-footer { margin-top: auto; padding-top: 14px; border-top: 1px solid var(--border); font-size: 11px; color: var(--text-dim); }

    /* ── MAIN ────────────────────────────────────────────────── */
    .main { margin-left: 230px; padding: 24px 28px; min-height: 100vh; }
    .topbar { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 24px; gap: 16px; }
    .page-eyebrow { font-size: 10px; font-family: var(--mono); color: var(--text-dim); text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 4px; }
    .page-title   { font-size: 20px; font-weight: 700; letter-spacing: -.5px; color: var(--text); }
    .topbar-right { display: flex; gap: 8px; align-items: center; flex-shrink: 0; }

    .btn {
      display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px;
      border-radius: 7px; font-size: 12px; font-weight: 500; cursor: pointer;
      border: none; text-decoration: none; transition: all .15s; white-space: nowrap;
    }
    .btn-primary { background: var(--accent); color: #fff; }
    .btn-primary:hover { background: #2563eb; }
    .btn-ghost { background: var(--surface2); color: var(--text-muted); border: 1px solid var(--border2); }
    .btn-ghost:hover { color: var(--text); background: var(--surface3); }
    .btn-danger { background: var(--danger-bg); color: var(--danger); border: 1px solid var(--danger-border); }

    /* ── VISTAS ──────────────────────────────────────────────── */
    .view-section { display: none; }
    .view-section.active { display: block; }

    /* ── KPI STRIP ───────────────────────────────────────────── */
    .kpi-strip { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 18px; }
    .kpi-card {
      background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
      padding: 14px 16px; position: relative; overflow: hidden;
      box-shadow: var(--shadow);
    }
    .kpi-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px; background: var(--kpi-color, var(--accent)); }
    .kpi-label { font-size: 10px; text-transform: uppercase; letter-spacing: .8px; color: var(--text-muted); margin-bottom: 6px; }
    .kpi-value { font-family: var(--mono); font-size: 24px; font-weight: 600; color: var(--text); letter-spacing: -1px; line-height: 1; }
    .kpi-sub   { font-size: 10px; color: var(--text-dim); margin-top: 4px; }

    /* ── TOOLBAR ─────────────────────────────────────────────── */
    .toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
    .search-box {
      display: flex; align-items: center; gap: 8px;
      background: var(--surface); border: 1px solid var(--border2);
      border-radius: 7px; padding: 7px 12px; flex: 1; min-width: 200px; max-width: 280px;
      transition: border-color .15s;
    }
    .search-box:focus-within { border-color: var(--accent); }
    .search-box input { background: none; border: none; outline: none; color: var(--text); font-size: 12.5px; width: 100%; }
    .search-box input::placeholder { color: var(--text-dim); }
    .filter-select {
      background: var(--surface); border: 1px solid var(--border2); color: var(--text-muted);
      border-radius: 7px; padding: 7px 12px; font-size: 12.5px; outline: none; cursor: pointer;
      font-family: var(--sans); transition: border-color .15s;
    }
    .filter-select:focus { border-color: var(--accent); color: var(--text); }

    /* ── TABLE ───────────────────────────────────────────────── */
    .table-wrap { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; box-shadow: var(--shadow); }
    table { width: 100%; border-collapse: collapse; }
    thead th {
      font-size: 10px; color: var(--text-dim); text-transform: uppercase; letter-spacing: .8px;
      padding: 10px 14px; text-align: left; border-bottom: 1px solid var(--border);
      background: var(--surface2); font-weight: 600; white-space: nowrap;
    }
    tbody tr { border-bottom: 1px solid var(--border); transition: background .1s; cursor: pointer; }
    tbody tr:last-child { border-bottom: none; }
    tbody tr:hover { background: var(--surface3) !important; }
    tbody td { padding: 10px 14px; font-size: 12.5px; color: var(--text); vertical-align: middle; }

    .row-danger { background: rgba(239,68,68,.03); }
    .row-warn   { background: rgba(245,158,11,.03); }
    .row-resolved { opacity: .6; }

    .badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 500; white-space: nowrap; }
    .badge-danger  { background: var(--danger-bg);  color: var(--danger);  border: 1px solid var(--danger-border); }
    .badge-warn    { background: var(--warn-bg);    color: var(--warn);    border: 1px solid var(--warn-border); }
    .badge-accent  { background: var(--accent-bg);  color: var(--accent2); border: 1px solid rgba(37,99,235,.25); }
    .badge-success { background: var(--success-bg); color: var(--success); border: 1px solid var(--success-border); }
    .badge-neutral { background: var(--surface3);   color: var(--text-muted); border: 1px solid var(--border2); }

    .wa-link {
      font-family: var(--mono); font-size: 11px; color: var(--success); font-weight: 500;
      text-decoration: none; display: inline-flex; align-items: center; gap: 4px;
      padding: 3px 7px; background: var(--success-bg); border-radius: 5px;
      border: 1px solid var(--success-border); transition: all .15s;
    }
    .wa-link:hover { background: var(--success); color: #fff; }

    .date-mono  { font-family: var(--mono); font-size: 11px; color: var(--text-dim); }
    .desc-cell  { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .nota-preview { font-size: 10px; color: var(--text-dim); font-style: italic; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .pagination { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; border-top: 1px solid var(--border); font-size: 11px; }
    .pag-info { color: var(--text-muted); font-family: var(--mono); }
    .page-btns { display: flex; gap: 3px; }
    .page-btn {
      padding: 4px 9px; border-radius: 5px; cursor: pointer;
      background: var(--surface2); border: 1px solid var(--border2);
      color: var(--text-muted); font-size: 11px; font-family: var(--mono); transition: all .1s;
    }
    .page-btn:hover  { color: var(--text); border-color: var(--accent); }
    .page-btn.current{ background: var(--accent); color: #fff; border-color: var(--accent); }

    /* ── MODAL ───────────────────────────────────────────────── */
    .modal-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,.35);
      display: flex; align-items: center; justify-content: center; z-index: 200;
      opacity: 0; pointer-events: none; transition: opacity .2s; backdrop-filter: blur(2px);
    }
    .modal-overlay.open { opacity: 1; pointer-events: auto; }
    .modal {
      background: var(--surface); border: 1px solid var(--border2); border-radius: 14px;
      width: 100%; max-width: 540px; max-height: 90vh; overflow-y: auto; padding: 26px;
      transform: translateY(14px) scale(.98); transition: transform .2s; box-shadow: var(--shadow);
    }
    .modal-overlay.open .modal { transform: translateY(0) scale(1); }
    .modal-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
    .modal-title  { font-size: 16px; font-weight: 700; color: var(--text); }
    .modal-close  { background: var(--surface2); border: 1px solid var(--border2); border-radius: 6px; width: 28px; height: 28px; cursor: pointer; color: var(--text-muted); font-size: 14px; display: flex; align-items: center; justify-content: center; }
    .modal-close:hover { background: var(--surface3); color: var(--text); }
    .detail-row { display: flex; gap: 12px; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid var(--border); }
    .detail-row:last-child { border-bottom: none; margin-bottom: 0; }
    .detail-key { font-size: 10px; color: var(--text-dim); text-transform: uppercase; letter-spacing: .8px; width: 110px; flex-shrink: 0; padding-top: 2px; }
    .detail-val { font-size: 13px; word-break: break-word; color: var(--text); line-height: 1.5; }

    .modal-actions { margin-top: 20px; padding-top: 18px; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 12px; }
    .modal-actions label { font-size: 10px; text-transform: uppercase; letter-spacing: .8px; color: var(--text-dim); margin-bottom: 5px; display: block; }
    .estado-btns { display: flex; gap: 6px; flex-wrap: wrap; }
    .estado-btn {
      padding: 5px 12px; border-radius: 6px; font-size: 12px; font-weight: 500; cursor: pointer;
      border: 1px solid var(--border2); background: var(--surface2); color: var(--text-muted); transition: all .15s;
    }
    .estado-btn:hover, .estado-btn.active { border-color: var(--accent); color: var(--accent2); background: var(--accent-bg); }
    .estado-btn[data-e="Resuelto"].active   { border-color: var(--success); color: var(--success); background: var(--success-bg); }
    .estado-btn[data-e="En revisión"].active { border-color: var(--warn); color: var(--warn); background: var(--warn-bg); }
    .estado-btn[data-e="Descartado"].active  { border-color: var(--text-dim); color: var(--text-muted); background: var(--surface3); }
    .nota-textarea {
      width: 100%; background: var(--surface2); border: 1px solid var(--border2); border-radius: 7px;
      color: var(--text); font-family: var(--sans); font-size: 12.5px; padding: 9px 12px;
      resize: vertical; min-height: 72px; outline: none; transition: border-color .15s;
    }
    .nota-textarea:focus { border-color: var(--accent); }
    .save-feedback { font-size: 11px; margin-top: 4px; min-height: 16px; }
    .save-feedback.ok  { color: var(--success); }
    .save-feedback.err { color: var(--danger); }

    /* ── DASHBOARD ───────────────────────────────────────────── */
    .dash-kpi-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 20px; }
    .dash-kpi {
      background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
      padding: 16px 18px; position: relative; overflow: hidden; box-shadow: var(--shadow);
    }
    .dash-kpi::after { content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 2px; background: var(--dk-color, var(--accent)); }
    .dk-label { font-size: 10px; text-transform: uppercase; letter-spacing: .8px; color: var(--text-muted); margin-bottom: 8px; }
    .dk-value { font-family: var(--mono); font-size: 28px; font-weight: 600; color: var(--text); letter-spacing: -1.5px; line-height: 1; }
    .dk-sub   { font-size: 10px; color: var(--text-dim); margin-top: 5px; }
    .dk-pct { position: absolute; top: 14px; right: 14px; font-family: var(--mono); font-size: 10px; font-weight: 600; padding: 2px 6px; border-radius: 4px; }

    .charts-grid { display: grid; grid-template-columns: 1.6fr 1fr; gap: 16px; margin-bottom: 16px; }
    .charts-grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-bottom: 16px; }
    .chart-panel { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 18px 20px; box-shadow: var(--shadow); }
    .chart-panel-title { font-size: 11px; text-transform: uppercase; letter-spacing: .8px; color: var(--text-muted); font-weight: 600; margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; }
    .chart-panel-title span { font-family: var(--mono); font-size: 18px; font-weight: 600; color: var(--text); letter-spacing: -1px; }
    .chart-container { position: relative; }

    .rank-list { list-style: none; }
    .rank-item { display: flex; align-items: center; gap: 10px; padding: 7px 0; border-bottom: 1px solid var(--border); font-size: 12px; }
    .rank-item:last-child { border-bottom: none; }
    .rank-num { font-family: var(--mono); font-size: 10px; color: var(--text-dim); width: 16px; flex-shrink: 0; }
    .rank-bar-wrap { flex: 1; height: 4px; background: var(--surface3); border-radius: 2px; overflow: hidden; }
    .rank-bar { height: 100%; border-radius: 2px; background: var(--accent); transition: width .4s ease; }
    .rank-name { color: var(--text-muted); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .rank-cnt  { font-family: var(--mono); font-size: 11px; font-weight: 600; color: var(--accent2); background: var(--accent-bg); padding: 1px 7px; border-radius: 10px; flex-shrink: 0; }
  </style>
</head>
<body>

<!-- ── SIDEBAR ─────────────────────────────────────────────── -->
<aside class="sidebar">
  <div class="sidebar-logo">
    <div class="logo-icon">R30</div>
    <div>
      <div class="logo-text">Centro de Control</div>
      <div class="logo-sub">Ruta 30</div>
    </div>
  </div>

  <div class="nav-section">Operación</div>
  <button class="nav-item active" id="tab-reportes" onclick="switchView('reportes')">
    <svg class="ni-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="15" y2="15"/><line x1="9" y1="11" x2="15" y2="11"/></svg>
    Bandeja de Reportes
  </button>

  <div class="nav-section">Análisis</div>
  <button class="nav-item" id="tab-dashboard" onclick="switchView('dashboard')">
    <svg class="ni-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
    Métricas
  </button>

  <div class="nav-section">Herramientas</div>
  <a class="nav-item" href="?export=1">
    <svg class="ni-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
    Exportar CSV
  </a>

  <!-- Ticker en vivo -->
  <div class="sidebar-live">
    <div class="live-label"><span class="live-dot"></span>En vivo · 15 s</div>
    <div class="ticker-row"><span class="ticker-label">Total</span>      <span class="ticker-val" id="tk-total">—</span></div>
    <div class="ticker-row"><span class="ticker-label">Críticos</span>   <span class="ticker-val danger" id="tk-criticos">—</span></div>
    <div class="ticker-row"><span class="ticker-label">Pendientes</span> <span class="ticker-val warn"   id="tk-pend">—</span></div>
    <div class="ticker-row"><span class="ticker-label">En revisión</span><span class="ticker-val accent" id="tk-rev">—</span></div>
    <div class="ticker-row"><span class="ticker-label">Resueltos</span>  <span class="ticker-val success"id="tk-res">—</span></div>
    <div class="ticker-row"><span class="ticker-label">Hoy</span>        <span class="ticker-val"        id="tk-hoy">—</span></div>
  </div>

  <div class="sidebar-footer">
    <span style="font-family:var(--mono);font-size:10px;">v2.0</span> · Ruta 30 &copy; <?= date('Y') ?>
  </div>
</aside>

<!-- ── MAIN ────────────────────────────────────────────────── -->
<main class="main">

  <div class="topbar">
    <div>
      <div class="page-eyebrow" id="page-eyebrow">Operación · Bandeja</div>
      <div class="page-title"  id="page-title">Reportes en tiempo real</div>
    </div>
    <div class="topbar-right">
      <button class="btn btn-ghost" onclick="forzarActualizacion();">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
        Actualizar
      </button>
    </div>
  </div>

  <?php if ($error): ?>
  <div style="padding:12px 16px;background:var(--danger-bg);color:var(--danger);border:1px solid var(--danger-border);border-radius:8px;margin-bottom:18px;font-size:13px;">[!] Error Firebase: <?= htmlspecialchars($error) ?></div>
  <?php endif; ?>

  <!-- ══════════════════════════════════════════
       VISTA 1: BANDEJA DE REPORTES
  ══════════════════════════════════════════════ -->
  <div id="view-reportes" class="view-section active">
    <!-- KPI strip -->
    <div class="kpi-strip">
      <div class="kpi-card" style="--kpi-color:var(--accent)">
        <div class="kpi-label">Total</div>
        <div class="kpi-value" id="bk-total">—</div>
        <div class="kpi-sub">histórico</div>
      </div>
      <div class="kpi-card" style="--kpi-color:var(--danger)">
        <div class="kpi-label">Críticos</div>
        <div class="kpi-value" id="bk-crit" style="color:var(--danger)">—</div>
        <div class="kpi-sub">accidentes · disturbios</div>
      </div>
      <div class="kpi-card" style="--kpi-color:var(--warn)">
        <div class="kpi-label">Pendientes</div>
        <div class="kpi-value" id="bk-pend" style="color:var(--warn)">—</div>
        <div class="kpi-sub">sin resolver</div>
      </div>
      <div class="kpi-card" style="--kpi-color:var(--success)">
        <div class="kpi-label">Resueltos</div>
        <div class="kpi-value" id="bk-res" style="color:var(--success)">—</div>
        <div class="kpi-sub">estado final</div>
      </div>
      <div class="kpi-card" style="--kpi-color:var(--violet)">
        <div class="kpi-label">Hoy</div>
        <div class="kpi-value" id="bk-hoy" style="color:var(--violet)">—</div>
        <div class="kpi-sub"><?= date('d M') ?></div>
      </div>
    </div>

    <!-- Toolbar -->
    <div class="toolbar">
      <div class="search-box">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" id="busqueda" placeholder="Buscar descripción, unidad, tipo…" autocomplete="off"/>
      </div>
      <input type="text" id="rangoFechas" class="filter-select" placeholder="Rango de fechas…" readonly style="min-width:220px;cursor:pointer;"/>
      <select id="filtroEstado" class="filter-select" onchange="resetAndLoad()">
        <option value="">Todos los estados</option>
        <option value="Pendiente">Pendiente</option>
        <option value="En revisión">En revisión</option>
        <option value="Resuelto">Resuelto</option>
        <option value="Descartado">Descartado</option>
      </select>
      <select id="filtroTipo" class="filter-select" onchange="resetAndLoad()">
        <option value="">Todos los tipos</option>
        <!-- Rellenado dinámico vía AJAX dashboard -->
      </select>
      <button class="btn btn-ghost" onclick="limpiarFiltros()">✕ Limpiar</button>
    </div>

    <!-- Tabla -->
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Contacto</th>
            <th>Nombre</th>
            <th>Descripción</th>
            <th>Tipo</th>
            <th>Unidad</th>
            <th>Estado</th>
            <th>Nota</th>
          </tr>
        </thead>
        <tbody id="tabla-body">
          <tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-dim)">Cargando…</td></tr>
        </tbody>
      </table>
      <div class="pagination">
        <span class="pag-info" id="pag-info">—</span>
        <div class="page-btns" id="pag-btns"></div>
      </div>
    </div>
  </div>

  <!-- ══════════════════════════════════════════
       VISTA 2: DASHBOARD / MÉTRICAS
  ══════════════════════════════════════════════ -->
  <div id="view-dashboard" class="view-section">

    <!-- KPIs principales -->
    <div class="dash-kpi-grid">
      <div class="dash-kpi" style="--dk-color:var(--accent)">
        <div class="dk-label">Total Reportes</div>
        <div class="dk-value" id="dk-total">—</div>
        <div class="dk-sub">histórico</div>
      </div>
      <div class="dash-kpi" style="--dk-color:var(--danger)">
        <div class="dk-label">Incidencias Críticas</div>
        <div class="dk-value" id="dk-criticos" style="color:var(--danger)">—</div>
        <div class="dk-sub"><span id="dk-tasa-criticos">—</span> del total</div>
        <span class="dk-pct" id="dk-tasa-criticos-badge" style="background:var(--danger-bg);color:var(--danger)">—</span>
      </div>
      <div class="dash-kpi" style="--dk-color:var(--success)">
        <div class="dk-label">Tasa de Resolución</div>
        <div class="dk-value" id="dk-resueltos-rate" style="color:var(--success)">—</div>
        <div class="dk-sub" id="dk-resueltos-txt">—</div>
      </div>
      <div class="dash-kpi" style="--dk-color:var(--warn)">
        <div class="dk-label">Esta Semana</div>
        <div class="dk-value" id="dk-semana">—</div>
        <div class="dk-sub">desde el lunes</div>
      </div>
      <div class="dash-kpi" style="--dk-color:var(--violet)">
        <div class="dk-label">Pendientes</div>
        <div class="dk-value" id="dk-pendientes" style="color:var(--warn)">—</div>
        <div class="dk-sub">requieren atención</div>
      </div>
    </div>

    <!-- Fila 1 de gráficas -->
    <div class="charts-grid">
      <div class="chart-panel">
        <div class="chart-panel-title">
          Volumen últimos 7 días
          <span id="avg7-val" style="font-size:13px;color:var(--text-muted);font-family:var(--mono)">—</span>
        </div>
        <div class="chart-container" style="height:170px"><canvas id="chartArea"></canvas></div>
      </div>

      <div class="chart-panel">
        <div class="chart-panel-title">Distribución por tipo</div>
        <div style="display:flex;align-items:center;gap:16px">
          <div class="chart-container" style="height:150px;width:150px;flex-shrink:0"><canvas id="chartDonut"></canvas></div>
          <div style="flex:1;min-width:0" id="top-tipos-list"></div>
        </div>
      </div>
    </div>

    <!-- Fila 2: Por hora + Por semana + Top unidades -->
    <div class="charts-grid-3">
      <div class="chart-panel">
        <div class="chart-panel-title">Actividad por hora del día</div>
        <div class="chart-container" style="height:140px"><canvas id="chartHora"></canvas></div>
      </div>
      <div class="chart-panel">
        <div class="chart-panel-title">Semanas recientes</div>
        <div class="chart-container" style="height:140px"><canvas id="chartSemana"></canvas></div>
      </div>
      <div class="chart-panel">
        <div class="chart-panel-title">Top unidades con quejas</div>
        <ul class="rank-list" id="top-unidades-list">
          <li style="color:var(--text-dim);font-size:12px;padding:10px 0">Cargando…</li>
        </ul>
      </div>
    </div>

    <!-- Fila 3: Estados donut + Top tipos barra horizontal -->
    <div class="charts-grid">
      <div class="chart-panel">
        <div class="chart-panel-title">Tipos de incidencia (barras)</div>
        <div class="chart-container" style="height:200px"><canvas id="chartTiposBarra"></canvas></div>
      </div>
      <div class="chart-panel">
        <div class="chart-panel-title">Estado de reportes</div>
        <div style="display:flex;align-items:center;justify-content:center;gap:20px;height:180px">
          <div class="chart-container" style="height:160px;width:160px;flex-shrink:0"><canvas id="chartEstados"></canvas></div>
          <div style="display:flex;flex-direction:column;gap:8px;">
            <div style="display:flex;align-items:center;gap:8px;font-size:11px"><span style="width:8px;height:8px;border-radius:50%;background:#f59e0b;flex-shrink:0;display:inline-block"></span><span style="color:var(--text-muted)">Pendiente</span><span style="font-family:var(--mono);font-weight:600;color:var(--text);margin-left:auto" id="est-pend">—</span></div>
            <div style="display:flex;align-items:center;gap:8px;font-size:11px"><span style="width:8px;height:8px;border-radius:50%;background:#3b82f6;flex-shrink:0;display:inline-block"></span><span style="color:var(--text-muted)">En revisión</span><span style="font-family:var(--mono);font-weight:600;color:var(--text);margin-left:auto" id="est-rev">—</span></div>
            <div style="display:flex;align-items:center;gap:8px;font-size:11px"><span style="width:8px;height:8px;border-radius:50%;background:#10b981;flex-shrink:0;display:inline-block"></span><span style="color:var(--text-muted)">Resuelto</span><span style="font-family:var(--mono);font-weight:600;color:var(--text);margin-left:auto" id="est-res">—</span></div>
            <div style="display:flex;align-items:center;gap:8px;font-size:11px"><span style="width:8px;height:8px;border-radius:50%;background:#64748b;flex-shrink:0;display:inline-block"></span><span style="color:var(--text-muted)">Descartado</span><span style="font-family:var(--mono);font-weight:600;color:var(--text);margin-left:auto" id="est-desc">—</span></div>
          </div>
        </div>
      </div>
    </div>
  </div><!-- /view-dashboard -->

</main><!-- /main -->

<!-- ── MODAL ─────────────────────────────────────────────── -->
<div class="modal-overlay" id="modal-overlay" onclick="closeModal(event)">
  <div class="modal">
    <div class="modal-header">
      <div>
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.8px;color:var(--text-dim);margin-bottom:4px" id="modal-eyebrow">Detalle</div>
        <div class="modal-title" id="modal-title">Reporte</div>
      </div>
      <button class="modal-close" onclick="closeModalDirect()">✕</button>
    </div>
    <div id="modal-body"></div>

    <div class="modal-actions">
      <div>
        <label>Estado del reporte</label>
        <div class="estado-btns">
          <button class="estado-btn" data-e="Pendiente"   onclick="setEstado(this)">Pendiente</button>
          <button class="estado-btn" data-e="En revisión" onclick="setEstado(this)">En revisión</button>
          <button class="estado-btn" data-e="Resuelto"    onclick="setEstado(this)">Resuelto</button>
          <button class="estado-btn" data-e="Descartado"  onclick="setEstado(this)">Descartado</button>
        </div>
      </div>
      <div>
        <label>Nota interna</label>
        <textarea class="nota-textarea" id="modal-nota" placeholder="Agrega una nota operativa…"></textarea>
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <button class="btn btn-primary" onclick="guardarCambios()" id="btn-save">Guardar cambios</button>
        <div class="save-feedback" id="save-feedback"></div>
      </div>
    </div>
  </div>
</div>

<!-- ── SCRIPTS ────────────────────────────────────────────── -->
<script src="https://cdn.jsdelivr.net/npm/flatpickr"></script>
<script src="https://npmcdn.com/flatpickr/dist/l10n/es.js"></script>
<script>
// ── Chart.js Setup ──────────────────────────────────────────
Chart.defaults.color = '#64748b'; // Tokens light theme
Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.font.size = 10;
const COLORS = ['#3b82f6','#ef4444','#f59e0b','#10b981','#8b5cf6','#ec4899','#06b6d4','#f97316'];
const GRID_COLOR = '#e2e8f0';
const BORDER_BG = '#ffffff';

let chartArea, chartDonut, chartHora, chartSemana, chartTiposBarra, chartEstados;

function initCharts() {
  chartArea = new Chart('chartArea', {
    type: 'line',
    data: { labels: [], datasets: [{ data: [], borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,.10)', borderWidth: 2, fill: true, tension: .4, pointRadius: 4, pointBackgroundColor: '#3b82f6', pointBorderColor: BORDER_BG, pointBorderWidth: 2 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { color: GRID_COLOR } }, y: { grid: { color: GRID_COLOR }, beginAtZero: true } } }
  });

  chartDonut = new Chart('chartDonut', {
    type: 'doughnut',
    data: { labels: [], datasets: [{ data: [], backgroundColor: COLORS, borderColor: BORDER_BG, borderWidth: 3, hoverOffset: 6 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { display: false } } }
  });

  chartHora = new Chart('chartHora', {
    type: 'bar',
    data: { labels: Array.from({length:24}, (_,i) => i%4===0 ? `${i}h` : ''), datasets: [{ data: [], backgroundColor: '#3b82f6', borderRadius: 3 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend:{display:false} }, scales: { x:{grid:{color:GRID_COLOR}}, y:{grid:{color:GRID_COLOR},beginAtZero:true} } }
  });

  chartSemana = new Chart('chartSemana', {
    type: 'bar',
    data: { labels: [], datasets: [{ data: [], backgroundColor: '#8b5cf6', borderRadius: 4 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend:{display:false} }, scales: { x:{grid:{color:GRID_COLOR}}, y:{grid:{color:GRID_COLOR},beginAtZero:true} } }
  });

  chartTiposBarra = new Chart('chartTiposBarra', {
    type: 'bar',
    data: { labels: [], datasets: [{ data: [], backgroundColor: COLORS, borderRadius: 4 }] },
    options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend:{display:false} }, scales: { x: { grid:{color:GRID_COLOR}, beginAtZero:true }, y: { grid:{display:false}, ticks:{ font:{size:9} } } } }
  });

  chartEstados = new Chart('chartEstados', {
    type: 'doughnut',
    data: { labels: ['Pendiente','En revisión','Resuelto','Descartado'], datasets: [{ data: [], backgroundColor: ['#f59e0b','#3b82f6','#10b981','#64748b'], borderColor:BORDER_BG, borderWidth:3, cutout:'65%' }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend:{display:false} } }
  });
}

// ── FLATPICKR ────────────────────────────────────────────────
let fpInstance = flatpickr('#rangoFechas', {
  mode: 'range', dateFormat: 'Y-m-d', locale: 'es',
  onChange: dates => { if (dates.length===2) { paginaActual=1; cargarTabla(); } }
});

// ── VISTAS ───────────────────────────────────────────────────
function switchView(v) {
  document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.getElementById('view-'+v).classList.add('active');
  document.getElementById('tab-'+v).classList.add('active');
  const titles = { reportes:['Operación · Bandeja','Reportes en tiempo real'], dashboard:['Análisis · Métricas','Dashboard ejecutivo'] };
  document.getElementById('page-eyebrow').textContent = titles[v][0];
  document.getElementById('page-title').textContent   = titles[v][1];
}

// ── MODAL ────────────────────────────────────────────────────
let modalDocId = null;

function openModal(data) {
  modalDocId = data._id;
  document.getElementById('modal-eyebrow').textContent = data.tipo || 'Reporte';
  document.getElementById('modal-title').textContent   = data.unidadLabel || data.unidad || '—';

  const rows = [
    ['Fecha',       formatFecha(data.fechaEnvio)],
    ['Hora',        data.hora || '—'],
    ['Contacto',    formatTel(data.usuario)],
    ['Nombre',      data.nombre && data.nombre !== 'Anónimo'
                      ? `<span style="font-weight:500">${data.nombre}</span>`
                      : `<span style="color:var(--text-dim);font-style:italic">Anónimo</span>`],
    ['Descripción', `<span style="white-space:pre-wrap;line-height:1.6">${data.descripcion||'—'}</span>`],
    ['Unidad',      data.unidadLabel||data.unidad||'—'],
    ['ID Firestore',`<span style="font-family:var(--mono);font-size:11px;color:var(--text-dim)">${data._id}</span>`],
  ];
  document.getElementById('modal-body').innerHTML = rows.map(([k,v]) =>
    `<div class="detail-row"><div class="detail-key">${k}</div><div class="detail-val">${v}</div></div>`
  ).join('');

  const estadoActual = data.estado || 'Pendiente';
  document.querySelectorAll('.estado-btn').forEach(btn => { btn.classList.toggle('active', btn.dataset.e === estadoActual); });
  document.getElementById('modal-nota').value = data.nota || '';
  document.getElementById('save-feedback').textContent = '';
  document.getElementById('save-feedback').className = 'save-feedback';
  document.getElementById('modal-overlay').classList.add('open');
}

function closeModal(e) { if (e.target===document.getElementById('modal-overlay')) closeModalDirect(); }
function closeModalDirect() { document.getElementById('modal-overlay').classList.remove('open'); modalDocId=null; }
document.addEventListener('keydown', e => { if (e.key==='Escape') closeModalDirect(); });

function setEstado(btn) {
  document.querySelectorAll('.estado-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

async function guardarCambios() {
  if (!modalDocId) return;
  const estado = document.querySelector('.estado-btn.active')?.dataset.e || 'Pendiente';
  const nota   = document.getElementById('modal-nota').value;
  const fb = document.getElementById('save-feedback');
  const btn = document.getElementById('btn-save');
  btn.disabled = true; btn.textContent = 'Guardando…';
  fb.className = 'save-feedback'; fb.textContent = '';

  const fd = new FormData(); fd.append('id', modalDocId); fd.append('estado', estado); fd.append('nota', nota);

  try {
    const res = await fetch('?write=true', { method:'POST', body: fd });
    const json = await res.json();
    if (json.ok) {
      fb.className = 'save-feedback ok'; fb.textContent = '✓ Guardado correctamente';
      // Refresca todo asíncronamente (caché ya fue destruido en el backend)
      setTimeout(() => { cargarTabla(); cargarDashboard(); }, 400);
    } else {
      throw new Error(json.error || 'Error desconocido');
    }
  } catch (e) {
    fb.className = 'save-feedback err'; fb.textContent = '✕ Error: ' + e.message;
  } finally {
    btn.disabled = false; btn.textContent = 'Guardar cambios';
  }
}

// ── FORMATEADORES ────────────────────────────────────────────
function formatFecha(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('es-MX',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}); }
  catch(e) { return iso.substring(0,16).replace('T',' '); }
}
function formatTel(tel) {
  if (!tel) return '—';
  const c = String(tel).replace(/^521/,'');
  return c.length===10 ? `+52 ${c.slice(0,3)}-${c.slice(3,6)}-${c.slice(6)}` : tel;
}
function getBadgeHtml(tipo) {
  const t = (tipo||'').toLowerCase();
  if (t.includes('disturbio')||t.includes('accidente')||t.includes('acoso')||t.includes('conflicto')) return `<span class="badge badge-danger">${tipo}</span>`;
  if (t.includes('retraso')||t.includes('extraviado')) return `<span class="badge badge-warn">${tipo}</span>`;
  return `<span class="badge badge-accent">${tipo}</span>`;
}
function getEstadoBadge(e) {
  const map = { 'Resuelto':'badge-success','En revisión':'badge-accent','Descartado':'badge-neutral','Pendiente':'badge-warn' };
  return `<span class="badge ${map[e]||'badge-warn'}">${e||'Pendiente'}</span>`;
}

// ── AJAX TABLA ───────────────────────────────────────────────
let paginaActual = 1;

async function cargarTabla() {
  const q      = document.getElementById('busqueda').value;
  const fechas = document.getElementById('rangoFechas').value;
  const estado = document.getElementById('filtroEstado').value;
  const tipo   = document.getElementById('filtroTipo').value;

  try {
    const res  = await fetch(`?ajax=true&q=${encodeURIComponent(q)}&fecha=${encodeURIComponent(fechas)}&estado=${encodeURIComponent(estado)}&tipo=${encodeURIComponent(tipo)}&pag=${paginaActual}`);
    const json = await res.json();

    if (json.stats) {
      ['total','criticos','pend','rev','res','hoy'].forEach((k,i) => {
        const keys = ['total','criticos','pendientes','enRevision','resueltos','hoy'];
        const sidEl = document.getElementById('tk-'+k);
        if (sidEl) sidEl.textContent = json.stats[keys[i]] ?? '—';
      });
      const kpiMap = {total:json.stats.total, crit:json.stats.criticos, pend:json.stats.pendientes, res:json.stats.resueltos, hoy:json.stats.hoy};
      Object.entries(kpiMap).forEach(([k,v]) => { const el=document.getElementById('bk-'+k); if(el) el.textContent=v; });
    }

    document.getElementById('tabla-body').innerHTML = json.data.length === 0
      ? `<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-dim)">Sin resultados</td></tr>`
      : json.data.map(r => {
          const desc  = (r.descripcion||'').replace(/"/g,'&quot;');
          let rowClass = '';
          const t = (r.tipo||'').toLowerCase();
          const estadoR = r.estado||'Pendiente';
          if (estadoR==='Resuelto'||estadoR==='Descartado') rowClass='row-resolved';
          else if (t.includes('disturbio')||t.includes('accidente')||t.includes('acoso')||t.includes('conflicto')) rowClass='row-danger';
          else if (t.includes('retraso')||t.includes('extraviado')) rowClass='row-warn';
          const num = String(r.usuario||'').replace(/\D/g,'');
          const waHtml = num ? `<a href="https://wa.me/${num}" target="_blank" class="wa-link" onclick="event.stopPropagation()"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>${formatTel(r.usuario)}</a>` : '—';
          const notaHtml = r.nota ? `<span class="nota-preview" title="${(r.nota||'').replace(/"/g,'&quot;')}">📝 ${r.nota}</span>` : '<span style="color:var(--text-dim);font-size:11px">—</span>';
          const nombreDisplay = r.nombre && r.nombre !== 'Anónimo'
            ? `<span style="font-size:12px;font-weight:500">${r.nombre}</span>`
            : `<span style="font-size:11px;color:var(--text-dim);font-style:italic">Anónimo</span>`;
          return `<tr class="${rowClass}" onclick='openModal(${JSON.stringify(r).replace(/'/g,"\\'")})'>`
            +`<td><span class="date-mono">${formatFecha(r.fechaEnvio)}</span></td>`
            +`<td>${waHtml}</td>`
            +`<td>${nombreDisplay}</td>`
            +`<td class="desc-cell" title="${desc}">${desc||'—'}</td>`
            +`<td>${getBadgeHtml(r.tipo||'')}</td>`
            +`<td style="font-size:11px;color:var(--text-muted)">${r.unidadLabel||r.unidad||'—'}</td>`
            +`<td>${getEstadoBadge(estadoR)}</td>`
            +`<td>${notaHtml}</td>`
            +`</tr>`;
        }).join('');

    // Paginación
    document.getElementById('pag-info').textContent = `Página ${paginaActual} de ${json.pages} · ${json.total} registros`;
    let btns = '';
    if (paginaActual > 1) btns += `<button class="page-btn" onclick="cambiarPag(${paginaActual-1})">‹</button>`;
    for (let i=Math.max(1,paginaActual-2); i<=Math.min(json.pages,paginaActual+2); i++) {
      btns += `<button class="page-btn${i===paginaActual?' current':''}" onclick="cambiarPag(${i})">${i}</button>`;
    }
    if (paginaActual < json.pages) btns += `<button class="page-btn" onclick="cambiarPag(${paginaActual+1})">›</button>`;
    document.getElementById('pag-btns').innerHTML = btns;
  } catch(e) {
    document.getElementById('tabla-body').innerHTML = `<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--danger)">Error al cargar: ${e.message}</td></tr>`;
  }
}

// ── AJAX DASHBOARD ───────────────────────────────────────────
async function cargarDashboard() {
  try {
    const res = await fetch('?ajax=dashboard');
    const json = await res.json();
    const d = json.charts;
    const k = json.kpis;

    // Actualiza métricas texto
    document.getElementById('dk-total').textContent = k.total;
    document.getElementById('dk-criticos').textContent = k.criticos;
    document.getElementById('dk-tasa-criticos').textContent = k.tasaCriticos + '%';
    document.getElementById('dk-tasa-criticos-badge').textContent = k.tasaCriticos + '%';
    document.getElementById('dk-resueltos-rate').textContent = k.resolucionRate + '%';
    document.getElementById('dk-resueltos-txt').textContent = `${k.resueltos} / ${k.total} resueltos`;
    document.getElementById('dk-semana').textContent = k.semana;
    document.getElementById('dk-pendientes').textContent = k.pendientes;

    // Rellenar filtro Tipos de la bandeja
    const selectTipo = document.getElementById('filtroTipo');
    const prevVal = selectTipo.value;
    selectTipo.innerHTML = '<option value="">Todos los tipos</option>' + d.tiposAll.map(t => `<option value="${t}">${t}</option>`).join('');
    selectTipo.value = prevVal; // Mantiene el valor seleccionado al refrescar

    // Actualizar gráficas Chart.js
    const avg7 = d.porDia.length ? (d.porDia.reduce((a,b)=>a+b,0)/d.porDia.length).toFixed(1) : 0;
    document.getElementById('avg7-val').textContent = `prom. ${avg7}/día`;
    chartArea.data.labels = d.diasLabels;
    chartArea.data.datasets[0].data = d.porDia;
    chartArea.update();

    chartDonut.data.labels = d.tipos5;
    chartDonut.data.datasets[0].data = d.tipos5val;
    chartDonut.update();

    let t5html = '';
    d.tipos5.forEach((tipo, i) => {
      t5html += `<div style="font-size:11px;color:var(--text-muted);margin-bottom:5px;display:flex;justify-content:space-between;gap:8px">
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${tipo}">${tipo}</span>
        <span style="font-family:var(--mono);color:var(--text);flex-shrink:0">${d.tipos5val[i]}</span>
      </div>`;
    });
    document.getElementById('top-tipos-list').innerHTML = t5html;

    chartHora.data.datasets[0].data = d.porHora;
    // Colorea de azul la jornada principal
    chartHora.data.datasets[0].backgroundColor = d.porHora.map((_,i) => i>=7&&i<=21?'#3b82f6':'#cbd5e1');
    chartHora.update();

    chartSemana.data.labels = d.semLabels;
    chartSemana.data.datasets[0].data = d.porSemana;
    chartSemana.update();

    chartTiposBarra.data.labels = d.tiposAll.slice(0,8);
    chartTiposBarra.data.datasets[0].data = d.tiposAllV.slice(0,8);
    chartTiposBarra.update();

    chartEstados.data.datasets[0].data = d.estados;
    chartEstados.update();
    document.getElementById('est-pend').textContent = d.estados[0];
    document.getElementById('est-rev').textContent  = d.estados[1];
    document.getElementById('est-res').textContent  = d.estados[2];
    document.getElementById('est-desc').textContent = d.estados[3];

    let rankHtml = '';
    const maxU = Object.values(d.topUnidades).length ? Math.max(...Object.values(d.topUnidades)) : 1;
    let i = 1;
    for (const [uni, cnt] of Object.entries(d.topUnidades)) {
      const pct = Math.round((cnt / maxU) * 100);
      rankHtml += `<li class="rank-item">
        <span class="rank-num">${i++}</span>
        <span class="rank-name" title="${uni}">${uni}</span>
        <div class="rank-bar-wrap"><div class="rank-bar" style="width:${pct}%"></div></div>
        <span class="rank-cnt">${cnt}</span>
      </li>`;
    }
    document.getElementById('top-unidades-list').innerHTML = rankHtml || '<li style="color:var(--text-dim);font-size:12px;padding:10px 0">Sin datos</li>';

  } catch(e) {
    console.error("Error al cargar datos del dashboard:", e);
  }
}

function cambiarPag(p) { paginaActual=p; cargarTabla(); }
function resetAndLoad() { paginaActual=1; cargarTabla(); }
function limpiarFiltros() {
  document.getElementById('busqueda').value='';
  fpInstance.clear();
  document.getElementById('filtroEstado').value='';
  document.getElementById('filtroTipo').value='';
  resetAndLoad();
}

let typingTimer;
document.getElementById('busqueda').addEventListener('input', () => {
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => { paginaActual=1; cargarTabla(); }, 350);
});

// ── INIT ─────────────────────────────────────────────────────
initCharts();
cargarTabla();
cargarDashboard();

async function forzarActualizacion() {
  // 1. El botón borra el caché a la fuerza
  await fetch('?force_refresh=true');
  // 2. Refrescamos los datos de la vista
  cargarTabla();
  cargarDashboard();
}

// Auto-refresh automático (el caché de PHP ya expira a los 15s)
setInterval(() => {
  cargarTabla();
  cargarDashboard();
}, 15000);
</script>
</body>
</html>