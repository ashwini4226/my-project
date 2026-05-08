export type Severity = 'low' | 'medium' | 'high' | 'critical';

export interface HazardReport {
  id: string;
  lat: number;
  lng: number;
  category: 'pothole' | 'accident' | 'flood' | 'barrier' | 'construction' | 'landslide' | 'fallen_tree';
  severity: Severity;
  timestamp: number;
  note?: string;
  verificationCount: number;
  verifiedByMe?: boolean;
}

export interface EmergencyResource {
  id: string;
  lat: number;
  lng: number;
  type: 'hospital' | 'police' | 'pharmacy' | 'fuel' | 'shelter' | 'food' | 'water';
  name: string;
  address?: string;
  pincode?: string;
  distance?: number; // in meters, calculated at runtime
}

export interface AppState {
  isOffline: boolean;
  gpsStatus: 'locating' | 'active' | 'error';
  userLocation: [number, number] | null;
  heading: number | null;
  hazards: HazardReport[];
  resources: EmergencyResource[];
  syncQueue: any[];
}
