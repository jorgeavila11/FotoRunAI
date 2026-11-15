export type ActiveView = 'home' | 'events' | 'event' | 'photographer' | 'downloads';

export type UserRole = 'athlete' | 'photographer';

export interface FaceBox {
  top: number;   // percentage 0-100
  left: number;  // percentage 0-100
  width: number; // percentage 0-100
  height: number;// percentage 0-100
}

export interface EventItem {
  id: string;
  slug: string;
  title: string;
  dateLabel: string;
  city: string;
  state: string;
  location: string;
  distances: string;
  coverImage: string;
  officialAgency: string;
  photographersCount: number;
  totalArchivePhotos: number;
  totalVideos: number;
  checkpoints: string[];
  status: 'disponivel' | 'em_breve';
}

export interface PhotoItem {
  id: string;
  eventId: string;
  filename: string;
  imageUrl: string;
  mediaType: 'photo' | 'video';
  bibNumbers: string[];
  checkpoint: string;
  timeRange: 't1' | 't2' | 't3';
  capturedAt: string;
  photographer: string;
  cameraSpec: string;
  resolution: string;
  caption: string;
  faceDescriptor: string;
  faceBox?: FaceBox;
  isPodium?: boolean;
  price: number;
}

export interface FacialMatchResult {
  photoId: string;
  confidence: number;
  reason: string;
  faceBox?: FaceBox;
}

export interface UploadBatch {
  id: string;
  eventId: string;
  name: string;
  checkpoint: string;
  photoCount: number;
  facesIndexed: number;
  status: 'Concluído' | 'Em Revisão' | 'Processando';
  createdAt: string;
}

export interface SaleTransaction {
  id: string;
  eventId: string;
  photoLabel: string;
  thumbnailUrl: string;
  bibNumber: string;
  buyerName: string;
  buyerEmail: string;
  timestamp: string;
  purchaseType: 'Individual' | 'Combo Atleta' | 'Seleção';
  grossAmount: number;
  netAmount: number;
  paymentMethod: 'Pix' | 'Cartão';
}

export interface PricingConfig {
  individualPrice: number;
  packPrice: number;
  videoPrice: number;
  watermarkText: string;
  watermarkOpacity: number;
}

export interface OrderReceipt {
  id: string;
  eventId: string;
  eventTitle: string;
  athleteName: string;
  athleteEmail: string;
  athletePhone: string;
  bibNumber: string;
  purchaseType: 'pack' | 'selected' | 'single';
  paymentMethod: 'pix' | 'card';
  totalPaid: number;
  discountApplied: number;
  createdAt: string;
  unlockedPhotoIds: string[];
  officialTime: string;
  officialPace: string;
  category: string;
}

export interface AuthUser {
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  bibNumber?: string;
  pixKey?: string;
}
