import type { ApiResponse } from '../../../core/types/index.js';
import type { PersonWithAccount } from '../models/PersonModel.js';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * Person View — serializes people with their linked account balance.
 * Shows "owes you" or "you owe" based on the account balance sign.
 */
export const PersonView = {
  person(p: PersonWithAccount): ApiResponse {
    return {
      success: true,
      data: serializePerson(p),
    };
  },

  personList(people: PersonWithAccount[]): ApiResponse {
    return {
      success: true,
      data: people.map(serializePerson),
    };
  },
};

function serializePerson(p: PersonWithAccount) {
  const linkedAccount = p.accounts?.[0];
  const balance = linkedAccount
    ? new Decimal(linkedAccount.cachedBalance.toString())
    : new Decimal(0);

  return {
    id: p.id,
    name: p.name,
    phone: p.phone,
    address: p.address,
    label: p.label,
    createdAt: p.createdAt,
    linkedAccountId: linkedAccount?.id ?? null,
    balance: balance.toString(),
    // Positive balance (debit > credit) = they owe the user
    // Negative balance (credit > debit) = user owes them
    balanceDirection: balance.isPositive()
      ? 'receivable'
      : balance.isNegative()
        ? 'payable'
        : 'settled',
    balanceLabel: balance.isPositive()
      ? `Owes you ₹${balance.abs().toString()}`
      : balance.isNegative()
        ? `You owe ₹${balance.abs().toString()}`
        : 'Settled',
  };
}
