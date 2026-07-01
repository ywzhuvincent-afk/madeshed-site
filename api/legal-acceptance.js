import {
  LEGAL_DOCUMENT_VERSIONS,
  LEGALLY_REQUIRED_ACCEPTANCES,
  getUserFromRequest,
  hasSupabaseService,
  logAccountEvent,
  requestIpHash,
  requestUserAgent,
  supabaseInsert
} from './_supabase.js';

const LEGAL_DOCUMENT_TYPES = new Set(LEGALLY_REQUIRED_ACCEPTANCES);
const ACCOUNT_EVENTS_TABLE = 'account_events';

function send(res, status, body) {
  res.status(status).json(body);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'method_not_allowed' });
  }
  if (!hasSupabaseService()) {
    return send(res, 503, { error: 'supabase_service_not_configured', message: '法律同意系统暂未连接云端。' });
  }

  const auth = await getUserFromRequest(req);
  if (!auth.user) {
    return send(res, 401, { error: auth.error || 'unauthorized', message: '请先登录。' });
  }

  const requested = Array.isArray(req.body?.documents)
    ? req.body.documents
    : [req.body?.document_type || req.body?.documentType].filter(Boolean);
  const documents = [...new Set(requested.map((type) => String(type)))].filter((type) => LEGAL_DOCUMENT_TYPES.has(type));
  if (!documents.length) {
    return send(res, 400, { error: 'invalid_document_type', message: '请选择需要确认的法律文件。' });
  }

  const rows = documents.map((documentType) => ({
    user_id: auth.user.id,
    document_type: documentType,
    document_version: LEGAL_DOCUMENT_VERSIONS[documentType],
    accepted_at: new Date().toISOString(),
    ip_hash: requestIpHash(req),
    user_agent: requestUserAgent(req),
    payload: {
      source: req.body?.source || 'account_flow',
      LEGAL_DOCUMENT_TYPES: [...LEGAL_DOCUMENT_TYPES]
    }
  }));

  try {
    const saved = await supabaseInsert('legal_acceptances', rows, { upsert: true, onConflict: 'user_id,document_type' });
    await logAccountEvent(req, auth.user.id, 'legal_acceptance', {
      documents,
      versions: LEGAL_DOCUMENT_VERSIONS
    });
    return send(res, 200, { acceptances: saved, versions: LEGAL_DOCUMENT_VERSIONS });
  } catch (error) {
    return send(res, 500, { error: 'legal_acceptance_failed', message: error.message || '保存法律同意失败。' });
  }
}
