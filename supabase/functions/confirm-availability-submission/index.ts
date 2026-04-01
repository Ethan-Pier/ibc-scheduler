import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';

interface AvailabilitySlot {
  dayOfWeek: number;
  period: number;
}

interface AvailabilityChangeSummary {
  addedSlots: AvailabilitySlot[];
  removedSlots: AvailabilitySlot[];
  totalSelected: number;
  hasChanges: boolean;
}

type UserProfileRow = Record<string, unknown> | null;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

function getSlotKey(dayOfWeek: number, period: number): string {
  return `${dayOfWeek}-${period}`;
}

function normalizeAvailabilitySlots(slots: AvailabilitySlot[]): AvailabilitySlot[] {
  const seen = new Set<string>();

  return slots
    .filter((slot) =>
      Number.isInteger(slot.dayOfWeek)
      && Number.isInteger(slot.period)
      && slot.dayOfWeek >= 0
      && slot.dayOfWeek <= 4
      && slot.period >= 1
      && slot.period <= 8)
    .slice()
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.period - b.period)
    .filter((slot) => {
      const key = getSlotKey(slot.dayOfWeek, slot.period);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

function diffAvailabilitySlots(
  confirmedSlots: AvailabilitySlot[],
  nextSlots: AvailabilitySlot[],
): AvailabilityChangeSummary {
  const confirmed = new Set(confirmedSlots.map((slot) => getSlotKey(slot.dayOfWeek, slot.period)));
  const next = new Set(nextSlots.map((slot) => getSlotKey(slot.dayOfWeek, slot.period)));
  const addedSlots = nextSlots.filter((slot) => !confirmed.has(getSlotKey(slot.dayOfWeek, slot.period)));
  const removedSlots = confirmedSlots.filter((slot) => !next.has(getSlotKey(slot.dayOfWeek, slot.period)));

  return {
    addedSlots,
    removedSlots,
    totalSelected: nextSlots.length,
    hasChanges: addedSlots.length > 0 || removedSlots.length > 0,
  };
}

function formatSlotLabel(slot: AvailabilitySlot): string {
  const dayLabels = ['周一', '周二', '周三', '周四', '周五'];
  return `${dayLabels[slot.dayOfWeek] || `第${slot.dayOfWeek + 1}天`} 第${slot.period}节`;
}

function formatSlotList(slots: AvailabilitySlot[]): string {
  if (slots.length === 0) {
    return '无';
  }

  return slots.map(formatSlotLabel).join('、');
}

function formatDateTime(isoString: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(isoString));
}

function extractUserIdentifier(profile: UserProfileRow, userId: string): string {
  if (profile && typeof profile === 'object') {
    const candidateKeys = ['student_id', 'studentId', 'student_no', 'student_number'];

    for (const key of candidateKeys) {
      const value = profile[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }
  }

  return userId;
}

async function replaceUserAvailability(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  slots: AvailabilitySlot[],
) {
  const { error: deleteError } = await supabaseAdmin
    .from('availability')
    .delete()
    .eq('user_id', userId);

  if (deleteError) {
    throw deleteError;
  }

  if (slots.length === 0) {
    return;
  }

  const { error: insertError } = await supabaseAdmin
    .from('availability')
    .insert(
      slots.map((slot) => ({
        user_id: userId,
        day_of_week: slot.dayOfWeek,
        period: slot.period,
      })),
    );

  if (insertError) {
    throw insertError;
  }
}

async function sendAvailabilityEmail(options: {
  resendApiKey: string;
  resendFromEmail: string;
  adminEmail: string;
  userName: string;
  userIdentifier: string;
  submittedAt: string;
  changeSummary: AvailabilityChangeSummary;
  finalSlots: AvailabilitySlot[];
}) {
  const subject = `IBC 给班确认通知 - ${options.userName}`;
  const submittedAtText = formatDateTime(options.submittedAt);
  const addedText = formatSlotList(options.changeSummary.addedSlots);
  const removedText = formatSlotList(options.changeSummary.removedSlots);
  const finalText = formatSlotList(options.finalSlots);

  const text = [
    'IBC 给班确认通知',
    '',
    `提交人：${options.userName}`,
    `学号/用户标识：${options.userIdentifier}`,
    `提交时间：${submittedAtText}`,
    `新增班次：${addedText}`,
    `取消班次：${removedText}`,
    `当前最终给班总数：${options.finalSlots.length}`,
    `当前最终给班清单：${finalText}`,
  ].join('\n');

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.7;color:#0f172a;">
      <h2 style="margin:0 0 16px;">IBC 给班确认通知</h2>
      <p style="margin:0 0 8px;"><strong>提交人：</strong>${options.userName}</p>
      <p style="margin:0 0 8px;"><strong>学号/用户标识：</strong>${options.userIdentifier}</p>
      <p style="margin:0 0 8px;"><strong>提交时间：</strong>${submittedAtText}</p>
      <p style="margin:0 0 8px;"><strong>新增班次：</strong>${addedText}</p>
      <p style="margin:0 0 8px;"><strong>取消班次：</strong>${removedText}</p>
      <p style="margin:0 0 8px;"><strong>当前最终给班总数：</strong>${options.finalSlots.length}</p>
      <p style="margin:0;"><strong>当前最终给班清单：</strong>${finalText}</p>
    </div>
  `;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: options.resendFromEmail,
      to: [options.adminEmail],
      subject,
      html,
      text,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Resend error: ${response.status} ${errorText}`);
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const resendFromEmail = Deno.env.get('RESEND_FROM_EMAIL');
    const adminEmail = Deno.env.get('ADMIN_NOTIFICATION_EMAIL');

    if (!supabaseUrl || !serviceRoleKey || !resendApiKey || !resendFromEmail || !adminEmail) {
      return jsonResponse(
        { error: 'Missing required function secrets.' },
        500,
      );
    }

    const body = await request.json();
    const userId = typeof body?.userId === 'string' ? body.userId.trim() : '';
    const requestedSlots = Array.isArray(body?.slots) ? (body.slots as AvailabilitySlot[]) : [];

    if (!userId) {
      return jsonResponse({ error: 'Missing userId.' }, 400);
    }

    const normalizedSlots = normalizeAvailabilitySlots(requestedSlots);
    if (normalizedSlots.length !== requestedSlots.length) {
      return jsonResponse({ error: 'Invalid availability slot payload.' }, 400);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const [{ data: user, error: userError }, { data: existingAvailability, error: availabilityError }, { data: profile, error: profileError }] = await Promise.all([
      supabaseAdmin
        .from('users')
        .select('id, name')
        .eq('id', userId)
        .single(),
      supabaseAdmin
        .from('availability')
        .select('day_of_week, period')
        .eq('user_id', userId),
      supabaseAdmin
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle(),
    ]);

    if (userError || !user) {
      return jsonResponse({ error: 'User not found.' }, 404);
    }

    if (availabilityError) {
      throw availabilityError;
    }

    if (profileError && profileError.code !== 'PGRST116') {
      throw profileError;
    }

    const confirmedSlots = normalizeAvailabilitySlots(
      (existingAvailability || []).map((item) => ({
        dayOfWeek: Number(item.day_of_week),
        period: Number(item.period),
      })),
    );
    const changeSummary = diffAvailabilitySlots(confirmedSlots, normalizedSlots);

    if (!changeSummary.hasChanges) {
      return jsonResponse({ error: 'No availability changes to submit.' }, 400);
    }

    const submittedAt = new Date().toISOString();
    await replaceUserAvailability(supabaseAdmin, userId, normalizedSlots);

    try {
      await sendAvailabilityEmail({
        resendApiKey,
        resendFromEmail,
        adminEmail,
        userName: user.name,
        userIdentifier: extractUserIdentifier(profile as UserProfileRow, user.id),
        submittedAt,
        changeSummary,
        finalSlots: normalizedSlots,
      });
    } catch (emailError) {
      console.error('Availability email failed, attempting rollback:', emailError);
      try {
        await replaceUserAvailability(supabaseAdmin, userId, confirmedSlots);
      } catch (rollbackError) {
        console.error('Availability rollback failed:', rollbackError);
        return jsonResponse(
          {
            error: 'Email failed and availability rollback failed.',
          },
          500,
        );
      }

      return jsonResponse(
        {
          error: 'Email failed. Availability has been rolled back.',
        },
        502,
      );
    }

    return jsonResponse({
      success: true,
      savedSlots: normalizedSlots,
      changeSummary,
      submittedAt,
    });
  } catch (error) {
    console.error('Unexpected confirm-availability-submission error:', error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'Unexpected server error.' },
      500,
    );
  }
});
