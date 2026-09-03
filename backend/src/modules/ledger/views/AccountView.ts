import type { ApiResponse } from '../../../core/types/index.js';
import type { Account } from '@prisma/client';
import type { AccountWithBalance } from '../models/AccountModel.js';

/**
 * Account View — serializes chart of accounts data.
 */
export const AccountView = {
  account(acc: Account): ApiResponse {
    return {
      success: true,
      data: serializeAccount(acc),
    };
  },

  accountList(accounts: Account[]): ApiResponse {
    return {
      success: true,
      data: accounts.map(serializeAccount),
    };
  },

  chartOfAccounts(grouped: Record<string, Account[]>): ApiResponse {
    const data: Record<string, ReturnType<typeof serializeAccount>[]> = {};
    for (const [type, accounts] of Object.entries(grouped)) {
      data[type] = accounts.map(serializeAccount);
    }
    return {
      success: true,
      data,
    };
  },

  accountWithBalance(acc: AccountWithBalance): ApiResponse {
    return {
      success: true,
      data: {
        ...serializeAccount(acc),
        cachedBalance: acc.cachedBalance.toString(),
        liveBalance: acc.liveBalance?.toString() ?? acc.cachedBalance.toString(),
        postedThrough: acc.postedThrough,
      },
    };
  },
};

function serializeAccount(acc: Account) {
  return {
    id: acc.id,
    name: acc.name,
    type: acc.type,
    subtype: acc.subtype,
    personId: acc.personId,
    cashFlowCategory: acc.cashFlowCategory,
    cachedBalance: acc.cachedBalance.toString(),
    postedThrough: acc.postedThrough,
    createdAt: acc.createdAt,
  };
}
