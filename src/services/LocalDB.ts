import { HazardReport, EmergencyResource } from '../types';
import { ApiConfig } from '../config/apiConfig';

const HAZARDS_KEY = 'offlinenav_hazards';
const RESOURCES_KEY = 'offlinenav_resources';

const SAMPLE_RESOURCES: EmergencyResource[] = [
  { id: '1', lat: 13.3135, lng: 77.5305, type: 'hospital', name: 'RL Jalappa Hospital & Research', pincode: '561203' },
  { id: '2', lat: 13.2985, lng: 77.5385, type: 'police', name: 'Doddaballapur Town Police', pincode: '561203' },
  { id: '3', lat: 12.9242, lng: 74.8560, type: 'hospital', name: 'A J Hospital Mangalore', pincode: '575004' },
  { id: '4', lat: 12.3051, lng: 76.6551, type: 'police', name: 'Mysuru City Police', pincode: '570001' },
  { id: '5', lat: 15.3647, lng: 75.1240, type: 'fuel', name: 'HP Petrol Pump Hubli', pincode: '580020' },
  { id: '6', lat: 15.8497, lng: 74.4977, type: 'shelter', name: 'Belagavi Relief Camp', pincode: '590001' },
];

const SAMPLE_HAZARDS: HazardReport[] = [
  { id: 'h1', lat: 13.3140, lng: 77.5310, category: 'flood', severity: 'high', timestamp: Date.now() - 3600000, verificationCount: 12, note: "Puddles forming near hostel entrance" },
  { id: 'h2', lat: 13.3000, lng: 77.5350, category: 'accident', severity: 'critical', timestamp: Date.now() - 1800000, verificationCount: 5, note: "Bridge construction bottleneck" },
];

export class LocalDB {
  static init() {
    const initialized = localStorage.getItem('offlinenav_initialized_v4');
    if (!initialized) {
      localStorage.setItem(RESOURCES_KEY, JSON.stringify(SAMPLE_RESOURCES));
      localStorage.setItem(HAZARDS_KEY, JSON.stringify(SAMPLE_HAZARDS));
      localStorage.setItem('offlinenav_initialized_v4', 'true');
    }
  }

  static getResources(): EmergencyResource[] {
    return JSON.parse(localStorage.getItem(RESOURCES_KEY) || '[]');
  }

  static getHazards(): HazardReport[] {
    return JSON.parse(localStorage.getItem(HAZARDS_KEY) || '[]');
  }

  static async fetchNearbyResources(lat: number, lng: number): Promise<EmergencyResource[]> {
    if (!navigator.onLine) return this.getResources();

    try {
      // Specified Radii: Hospital 10km, Fuel 8km, Police 15km, Hotel 12km, Food 5km, Shelter 20km
      // We use a broader query and filter locally to minimize API calls
      const maxRadius = 20000;
      const query = `
        [out:json][timeout:25];
        (
          node["amenity"~"hospital|police|fuel|pharmacy|shelter|fire_station|restaurant|cafe|fast_food"](around:${maxRadius},${lat},${lng});
          way["amenity"~"hospital|police|fuel|pharmacy|shelter|fire_station|restaurant|cafe|fast_food"](around:${maxRadius},${lat},${lng});
          node["tourism"="hotel"](around:${maxRadius},${lat},${lng});
          way["tourism"="hotel"](around:${maxRadius},${lat},${lng});
        );
        out body;
        >;
        out skel qt;
      `;
      
      const response = await fetch(ApiConfig.overpassUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: `data=${encodeURIComponent(query)}`
      });

      if (!response.ok) throw new Error('Overpass API failed');
      
      const data = await response.json();
      const newResources: EmergencyResource[] = data.elements
        .filter((el: any) => el.lat && el.lon && el.tags)
        .map((el: any) => {
          const type = this.mapOsmType(el.tags);
          const dist = this.calculateDistance(lat, lng, el.lat, el.lon);
          
          return {
            id: `osm-${el.id}`,
            lat: el.lat,
            lng: el.lon,
            type,
            name: el.tags.name || `Unnamed ${el.tags.amenity || 'Resource'}`,
            address: el.tags['addr:street'] || '',
            pincode: el.tags['addr:postcode'] || '',
            distance: dist
          };
        })
        .filter((r: EmergencyResource) => {
          // Strict Radius Filtering per requirement
          const d = r.distance || 0;
          if (r.type === 'hospital' && d > 10000) return false;
          if (r.type === 'fuel' && d > 8000) return false;
          if (r.type === 'police' && d > 15000) return false;
          if (r.type === 'shelter' && d > 20000) return false;
          if (r.type === 'food' && d > 5000) return false;
          return true;
        });

      // Merge with local/sample and persist
      const existing = this.getResources();
      const merged = [...existing];
      newResources.forEach(nr => {
        if (!merged.find(m => m.id === nr.id)) merged.push(nr);
      });
      
      localStorage.setItem(RESOURCES_KEY, JSON.stringify(merged.slice(-500))); // Cache up to 500 for heavy offline use
      return merged.sort((a, b) => (this.calculateDistance(lat, lng, a.lat, a.lng)) - (this.calculateDistance(lat, lng, b.lat, b.lng)));
    } catch (error) {
      console.error('Failed to fetch real-time resources:', error);
      return this.getResources();
    }
  }

  private static mapOsmType(tags: any): any {
    if (!tags) return 'hospital';
    const amenity = tags.amenity;
    if (amenity === 'hospital' || amenity === 'doctors' || amenity === 'clinic') return 'hospital';
    if (amenity === 'police') return 'police';
    if (amenity === 'fuel') return 'fuel';
    if (amenity === 'pharmacy') return 'pharmacy';
    if (amenity === 'shelter' || tags.tourism === 'hotel' || tags.tourism === 'hostel') return 'shelter';
    if (amenity === 'restaurant' || amenity === 'cafe' || amenity === 'fast_food') return 'food';
    if (amenity === 'fire_station') return 'police';
    return 'hospital';
  }

  static addHazard(hazard: Omit<HazardReport, 'id' | 'timestamp' | 'verificationCount'>) {
    const hazards = this.getHazards();
    const newHazard: HazardReport = {
      ...hazard,
      id: Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
      verificationCount: 0
    };
    hazards.push(newHazard);
    localStorage.setItem(HAZARDS_KEY, JSON.stringify(hazards));
    return newHazard;
  }

  static verifyHazard(id: string) {
    const hazards = this.getHazards();
    const hazard = hazards.find(h => h.id === id);
    if (hazard) {
      hazard.verificationCount++;
      hazard.verifiedByMe = true;
      localStorage.setItem(HAZARDS_KEY, JSON.stringify(hazards));
    }
  }

  static searchResources(query: string, userLoc?: [number, number]): EmergencyResource[] {
    const resources = this.getResources();
    const filtered = resources.filter(r => 
      r.name.toLowerCase().includes(query.toLowerCase()) || 
      r.type.toLowerCase().includes(query.toLowerCase()) ||
      (r.pincode && r.pincode.includes(query))
    );

    if (userLoc) {
      return filtered.map(r => ({
        ...r,
        distance: this.calculateDistance(userLoc[0], userLoc[1], r.lat, r.lng)
      })).sort((a, b) => (a.distance || 0) - (b.distance || 0));
    }
    return filtered;
  }

  static setLastKnownLocation(lat: number, lng: number, heading: number | null) {
    localStorage.setItem('offlinenav_last_loc', JSON.stringify({ lat, lng, heading }));
  }

  static getLastKnownLocation(): { lat: number; lng: number; heading: number | null } | null {
    const data = localStorage.getItem('offlinenav_last_loc');
    try {
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  static calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
  }
}
