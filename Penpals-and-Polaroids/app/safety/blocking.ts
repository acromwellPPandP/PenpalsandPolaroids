type BlockedUsersRow = {
  blocked_user_id: string;
  blocker_id: string;
};

type LegacyBlockRow = {
  blocked_id: string;
  blocker_id: string;
};

type SupabaseLike = {
  from: (table: string) => any;
};

function isMissingTableError(error: { code?: string; message?: string } | null) {
  return (
    error?.code === "42P01" ||
    error?.message?.toLowerCase().includes("could not find the table")
  );
}

export async function getBlockedUserIds(supabase: SupabaseLike, userId: string) {
  const blockedUserIds = new Set<string>();

  const { data: phaseOneBlocks, error: phaseOneError } = await supabase
    .from("blocked_users")
    .select("blocker_id,blocked_user_id")
    .or(`blocker_id.eq.${userId},blocked_user_id.eq.${userId}`);

  if (!phaseOneError) {
    for (const block of (phaseOneBlocks ?? []) as BlockedUsersRow[]) {
      blockedUserIds.add(
        block.blocker_id === userId ? block.blocked_user_id : block.blocker_id,
      );
    }
  }

  const { data: legacyBlocks, error: legacyError } = await supabase
    .from("blocks")
    .select("blocker_id,blocked_id")
    .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`);

  if (!legacyError) {
    for (const block of (legacyBlocks ?? []) as LegacyBlockRow[]) {
      blockedUserIds.add(
        block.blocker_id === userId ? block.blocked_id : block.blocker_id,
      );
    }
  }

  return {
    blockedUserIds,
    safetyTablesMissing:
      isMissingTableError(phaseOneError) && isMissingTableError(legacyError),
  };
}

export async function areUsersBlocked(
  supabase: SupabaseLike,
  userId: string,
  otherUserId: string,
) {
  const relationship = await getBlockRelationship(supabase, userId, otherUserId);

  return {
    blocked:
      relationship.currentUserBlockedOther || relationship.otherUserBlockedCurrent,
    safetyTablesMissing: relationship.safetyTablesMissing,
  };
}

export async function getBlockRelationship(
  supabase: SupabaseLike,
  userId: string,
  otherUserId: string,
) {
  let currentUserBlockedOther = false;
  let otherUserBlockedCurrent = false;
  const { data: phaseOneBlocks, error: phaseOneError } = await supabase
    .from("blocked_users")
    .select("blocker_id,blocked_user_id")
    .or(
      `and(blocker_id.eq.${userId},blocked_user_id.eq.${otherUserId}),and(blocker_id.eq.${otherUserId},blocked_user_id.eq.${userId})`,
    );

  if (!phaseOneError) {
    for (const block of (phaseOneBlocks ?? []) as BlockedUsersRow[]) {
      currentUserBlockedOther ||= block.blocker_id === userId;
      otherUserBlockedCurrent ||= block.blocker_id === otherUserId;
    }
  }

  const { data: legacyBlocks, error: legacyError } = await supabase
    .from("blocks")
    .select("blocker_id,blocked_id")
    .or(
      `and(blocker_id.eq.${userId},blocked_id.eq.${otherUserId}),and(blocker_id.eq.${otherUserId},blocked_id.eq.${userId})`,
    );

  if (!legacyError) {
    for (const block of (legacyBlocks ?? []) as LegacyBlockRow[]) {
      currentUserBlockedOther ||= block.blocker_id === userId;
      otherUserBlockedCurrent ||= block.blocker_id === otherUserId;
    }
  }

  return {
    currentUserBlockedOther,
    otherUserBlockedCurrent,
    safetyTablesMissing:
      isMissingTableError(phaseOneError) && isMissingTableError(legacyError),
  };
}
