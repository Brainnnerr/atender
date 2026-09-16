import { supabase } from './supabaseClient';

export const logAdminAction = async ({
  currentUser,
  actionType,
  module,
  targetId = null,
  details = {},
}) => {
  if (!currentUser) return;

  try {
    const actorEmail = currentUser.email || 'unknown@essu.edu.ph';
    const actorName = currentUser.user_metadata?.full_name || currentUser.email?.split('@')[0] || 'Admin Officer';

    await supabase.rpc('log_system_action', {
      p_actor_id: currentUser.id,
      p_actor_email: actorEmail,
      p_actor_name: actorName,
      p_action_type: actionType,
      p_module: module,
      p_target_id: targetId ? String(targetId) : null,
      p_details: details,
    });
  } catch (err) {
    console.warn('Audit log write error:', err);
  }
};