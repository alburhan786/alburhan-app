const BASE = import.meta.env.BASE_URL || "/";

export interface CompanyInfo {
  id: string;
  name: string;
  nameShort: string;
  arabicName: string;
  address: string;
  phone: string;
  mobile: string;
  phoneSaudi: string;
  email: string;
  website: string;
  logoUrl: string | null;
  isDefault: boolean;
}

export const COMPANIES: CompanyInfo[] = [
  {
    id: "alburhan",
    name: "AL BURHAN TOURS AND TRAVELS",
    nameShort: "AL BURHAN",
    arabicName: "البرهان للسياحة والسفرات",
    address: "Shop No 8-5, Khanka Masjid Complex, Sanwara Road, Burhanpur 450331 M.P.",
    phone: "+91 9893225590 / +91 9893989786",
    mobile: "+91 9893989786",
    phoneSaudi: "0547090786 | 0568780786",
    email: "info@alburhantravels.com",
    website: "www.alburhantravels.com",
    logoUrl: `${BASE}images/logo.png`,
    isDefault: true,
  },
  {
    id: "horizon",
    name: "HORIZON TOURS & TRAVELS",
    nameShort: "HORIZON",
    arabicName: "هوريزون للسياحة والسفرات",
    address: "201, 2nd Floor, Vardhman City-2 Plaza, Near Haji Manzil, Asaf Ali Road, New Delhi - 110002",
    phone: "+91-11-4576873 / +91-11-23210377",
    mobile: "+91-9811797327",
    phoneSaudi: "0568780786",
    email: "horizontravels900@yahoo.co.in",
    website: "www.horizontravels.in",
    logoUrl: `${BASE}images/horizon_logo.png`,
    isDefault: false,
  },
];

export function getDefaultCompany(): CompanyInfo {
  return COMPANIES.find(c => c.isDefault) ?? COMPANIES[0];
}

export function getCompanyById(id: string): CompanyInfo {
  return COMPANIES.find(c => c.id === id) ?? COMPANIES[0];
}
