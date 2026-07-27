import axios from 'axios';

const TRANSFI_BASE_URL =
  process.env.TRANSFI_BASE_URL || 'https://sandbox-api.transfi.com';

const TRANSFI_USERNAME = process.env.TRANSFI_USERNAME || '';
const TRANSFI_PASSWORD = process.env.TRANSFI_PASSWORD || '';
const TRANSFI_MID = process.env.TRANSFI_MID || '';

const transfiClient = axios.create({
  baseURL: TRANSFI_BASE_URL,
  auth: {
    username: TRANSFI_USERNAME,
    password: TRANSFI_PASSWORD,
  },
  headers: {
    'Content-Type': 'application/json',
    MID: TRANSFI_MID,
  },
});

const COUNTRY_CODE_MAP: Record<string, string> = {
  Singapore: 'SG',
  Indonesia: 'ID',
  Malaysia: 'MY',
  UnitedStates: 'US',
  HongKong: 'HK',
  Taiwan: 'TW',
  SaudiArabia: 'SA',
  Qatar: 'QA',
  UnitedArabEmirates: 'AE',
  China: 'CN',
  Other: 'OT',
};

function normalizePhone(
  phone: string | null | undefined
): string | undefined {
  if (!phone) return undefined;

  return phone.replace(/\D/g, '');
}

function getCountryCode(
  country: string | null | undefined
): string | undefined {
  if (!country) return undefined;

  if (country.length === 2) {
    return country.toUpperCase();
  }

  return COUNTRY_CODE_MAP[country] || undefined;
}

export interface CreateTransFiUserParams {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  phoneCode?: string | null;
  country?: string | null;
  countryOfResidence?: string | null;
  gender?: string | null;
  address?: {
    street?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
  } | null;
}

export interface CreateOnrampOrderParams {
  userId: string;
  amount: number;
  walletAddress: string;
  successRedirectUrl?: string;
  failureRedirectUrl?: string;
}

export interface CreateOnrampOrderResponse {
  status: 'success' | 'failure';
  data: {
    orderId: string;
    payUrl: string;
  };
  feeData?: {
    depositAmount: number;
    withdrawAmount: number;
    totalFee: number;
  };
  traceId?: string;
}

export async function createTransFiUser(
  data: CreateTransFiUserParams
) {
  const phone = normalizePhone(data.phone);
  const country = getCountryCode(data.country);
  const countryOfResidence = getCountryCode(
    data.countryOfResidence
  );

  const payload: any = {
    email: data.email,
    firstName: data.firstName || 'User',
    lastName: data.lastName || 'SakuLink',
  };

  if (phone) payload.phone = phone;
  if (data.phoneCode) payload.phoneCode = data.phoneCode;
  if (country) payload.country = country;
  if (countryOfResidence) {
    payload.countryOfResidence = countryOfResidence;
  }
  if (data.gender) payload.gender = data.gender;

  if (data.address) {
    const addr: any = {};

    if (data.address.street) addr.street = data.address.street;
    if (data.address.city) addr.city = data.address.city;
    if (data.address.state) addr.state = data.address.state;
    if (data.address.postalCode) {
      addr.postalCode = data.address.postalCode;
    }

    if (Object.keys(addr).length > 0) {
      payload.address = addr;
    }
  }

  if (!payload.email || !payload.firstName || !payload.lastName) {
    throw new Error(
      'Email, firstName, and lastName are required'
    );
  }

  console.log(
    'CREATE USER PAYLOAD:',
    JSON.stringify(payload, null, 2)
  );

  try {
    const response = await transfiClient.post(
      '/v3/users/individual',
      payload
    );

    console.log(
      'CREATE USER RESPONSE:',
      JSON.stringify(response.data, null, 2)
    );

    return response.data;
  } catch (error: any) {
    console.error(
      'CREATE USER ERROR:',
      JSON.stringify(error.response?.data, null, 2)
    );

    throw error;
  }
}

export async function createTransFiOnrampOrder(
  params: CreateOnrampOrderParams
): Promise<CreateOnrampOrderResponse> {
  const {
    userId,
    amount,
    walletAddress,
    successRedirectUrl = 'http://localhost:3000/success',
    failureRedirectUrl = 'http://localhost:3000/failure',
  } = params;

  const payload = {
    userId,
    orderType: 'onramp',
    purposeCode: 'personal',
    successRedirectUrl,
    failureRedirectUrl,
    source: {
      currency: 'USD',
      amount,
      paymentType: 'bank_transfer',
      paymentCode: 'wire',
    },
    destination: {
      currency: 'USDCBASE',
      walletAddress,
      additionalPaymentDetails: {
        walletOwner: 'exchange',
      },
    },
  };

  console.log(
    'TRANSFI PAYLOAD:',
    JSON.stringify(payload, null, 2)
  );

  try {
    const response = await transfiClient.post(
      '/v3/orders',
      payload
    );

    console.log(
      'TRANSFI RESPONSE:',
      JSON.stringify(response.data, null, 2)
    );

    return response.data;
  } catch (error: any) {
    console.error(
      'TRANSFI ERROR:',
      JSON.stringify(error.response?.data, null, 2)
    );

    throw new Error(
      error.response?.data?.error?.message ||
        'TransFi API error'
    );
  }
}

export async function getSupportedCurrencies() {
  const response = await transfiClient.get(
    '/v3/config/supported-currencies'
  );

  return response.data;
}

export async function getPaymentMethods(params?: {
  direction?: 'deposit' | 'withdrawal';
  currency?: string;
  userType?: 'individual' | 'business';
}) {
  const query = new URLSearchParams();

  if (params?.direction) {
    query.append('direction', params.direction);
  }

  if (params?.currency) {
    query.append('currency', params.currency);
  }

  if (params?.userType) {
    query.append('userType', params.userType);
  }

  const url = `/v3/config/payment-methods${
    query.toString() ? '?' + query.toString() : ''
  }`;

  const response = await transfiClient.get(url);

  return response.data;
}

export async function transfiOffRamp(...args: any[]) {
  console.warn('Offramp is temporarily disabled.');

  return {
    success: false,
    message: 'Offramp disabled',
  };
}

export default {
  createTransFiUser,
  createTransFiOnrampOrder,
  getSupportedCurrencies,
  getPaymentMethods,
  transfiOffRamp,
};