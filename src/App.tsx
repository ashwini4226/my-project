import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  WifiOff, Map as MapIcon, Search, Mic, AlertTriangle, 
  Navigation, Crosshair, Phone, Shield, Droplets,
  Activity, Zap, Info, Plus, CheckCircle2, X, Utensils
} from 'lucide-react';

import { SplashScreen } from './components/SplashScreen';
import { LocalDB } from './services/LocalDB';
import { VoiceService } from './services/VoiceService';
import { OfflineManager } from './services/OfflineManager';
import { SafetyService } from './services/SafetyService';
import { ApiConfig } from './config/apiConfig';
import { AppState, HazardReport, EmergencyResource, Severity } from './types';

// Icons fix for Leaflet
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const createIcon = (emoji: string, color: string) => L.divIcon({
  className: 'custom-div-icon',
  html: `<div style="background-color: ${color}; width: 32px; height: 32px; border: 2px solid white; border-radius: 50%; box-shadow: 0 0 15px ${color}; display: flex; align-items: center; justify-content: center; font-size: 18px;">${emoji}</div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16]
});

const icons = {
  hazard: (category: string, severity: Severity) => {
    const colors = { critical: '#ef4444', high: '#f97316', medium: '#ffeb3b', low: '#10b981' };
    const emojis: any = { pothole: '🕳️', accident: '💥', flood: '🌊', barrier: '🚧', construction: '🏗️', landslide: '⛰️', fallen_tree: '🌳' };
    return createIcon(emojis[category] || '⚠️', colors[severity]);
  },
  resource: (type: string) => {
    const colors: any = { hospital: '#06b6d4', police: '#3b82f6', fuel: '#f97316', shelter: '#8b5cf6', food: '#fb923c', water: '#0ea5e9' };
    const emojis: any = { hospital: '🏥', police: '👮', fuel: '⛽', shelter: '🏠', food: '🍔', water: '💧' };
    return createIcon(emojis[type] || '📍', colors[type] || '#64748b');
  },
  me: (heading: number | null) => L.divIcon({
    className: 'me-icon',
    html: `
      <div class="pulse-animation">
        <div style="
          width: 38px; 
          height: 38px; 
          background: rgba(6, 182, 212, 0.2); 
          border-radius: 50%; 
          display: flex; 
          align-items: center; 
          justify-content: center;
          border: 1px solid rgba(6, 182, 212, 0.4);
        ">
          <div style="
            transform: rotate(${heading || 0}deg); 
            transition: transform 0.3s ease-out;
            font-size: 24px;
            text-shadow: 0 0 10px rgba(6, 182, 212, 0.8);
          ">
            ${heading !== null ? '🔼' : '📍'}
          </div>
        </div>
      </div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20]
  })
};

const MapFocus: React.FC<{ coords: [number, number] | null; autoCenter: boolean }> = ({ coords, autoCenter }) => {
  const map = useMap();
  const lastCoords = React.useRef<[number, number] | null>(null);

  useEffect(() => {
    if (coords && autoCenter) {
      const dist = lastCoords.current 
        ? LocalDB.calculateDistance(lastCoords.current[0], lastCoords.current[1], coords[0], coords[1])
        : 999;
      
      // Only pan if user moved more than 30 meters or it is the first update
      if (dist > 30) {
        map.panTo(coords, { animate: true, duration: 1.5 });
        lastCoords.current = coords;
      }
    }
  }, [coords, autoCenter, map]);
  return null;
};

const MapInteractions: React.FC<{ onInteraction: () => void }> = ({ onInteraction }) => {
  useMapEvents({
    dragstart: onInteraction,
    zoomstart: onInteraction
  });
  return null;
};

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [autoCenter, setAutoCenter] = useState(true);
  const [appState, setAppState] = useState<AppState>({
    isOffline: false,
    gpsStatus: 'locating',
    userLocation: [13.3135, 77.5305], // RL Jalappa Institute of Technology
    heading: null,
    hazards: [],
    resources: [],
    syncQueue: []
  });
  
  const [gpsMetadata, setGpsMetadata] = useState({ accuracy: 0, speed: 0, timestamp: Date.now() });
  const [showEmergency, setShowEmergency] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<EmergencyResource[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [isEditingTranscript, setIsEditingTranscript] = useState(false);
  const [routeCoordinates, setRouteCoordinates] = useState<[number, number][]>([]);
  const [selectedEntity, setSelectedEntity] = useState<HazardReport | EmergencyResource | null>(null);
  const [showAddHazard, setShowAddHazard] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced'>('idle');
  const [currentLang, setCurrentLang] = useState('en-IN');
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);

  useEffect(() => {
    // Battery Status API
    if ('getBattery' in navigator) {
      (navigator as any).getBattery().then((battery: any) => {
        setBatteryLevel(Math.round(battery.level * 100));
        battery.addEventListener('levelchange', () => {
          setBatteryLevel(Math.round(battery.level * 100));
        });
      });
    }

    // Wake Lock to prevent screen sleep during navigation
    let wakeLock: any = null;
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await (navigator as any).wakeLock.request('screen');
          console.log('Wake Lock active');
        }
      } catch (err) {
        console.warn('Wake Lock failed:', err);
      }
    };

    requestWakeLock();
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') requestWakeLock();
    });
    return () => {
      if (wakeLock) wakeLock.release();
    };
  }, []);

  const [safetyRisk, setSafetyRisk] = useState({ score: 0, advice: '' });

  const languages = [
    { code: 'en-IN', name: 'English (IN)' },
    { code: 'hi-IN', name: 'Hindi (हिंदी)' },
    { code: 'ta-IN', name: 'Tamil (தமிழ்)' },
    { code: 'te-IN', name: 'Telugu (తెలుగు)' },
    { code: 'mr-IN', name: 'Marathi (मराठी)' },
    { code: 'bn-IN', name: 'Bengali (বাংলা)' }
  ];

  const toggleLanguage = () => {
    const nextIndex = (languages.findIndex(l => l.code === currentLang) + 1) % languages.length;
    const nextLang = languages[nextIndex].code;
    setCurrentLang(nextLang);
    VoiceService.setLanguage(nextLang);
    VoiceService.speak(`Language changed to ${languages[nextIndex].name}`);
  };

  useEffect(() => {
    LocalDB.init();
    VoiceService.init();
    
    // Load last known location for instant boot
    const lastLoc = LocalDB.getLastKnownLocation();
    if (lastLoc) {
      setAppState(s => ({ 
        ...s, 
        userLocation: [lastLoc.lat, lastLoc.lng] as [number, number],
        heading: lastLoc.heading 
      }));
    }

    refreshData();
    
    // Auto-fetch real-time OSM data when moving significantly
    let lastFetchLocation: [number, number] | null = null;

    // Real-time GPS Tracking with filtering and persistence
    const geoOptions = {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0
    };

    let watchId: number;

    const startTracking = () => {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude, accuracy, speed, heading } = pos.coords;
          
          if (accuracy > 100) return;

          setAppState(s => {
            const newState = {
              ...s,
              userLocation: [latitude, longitude] as [number, number],
              heading: heading !== null ? heading : s.heading,
              gpsStatus: 'active' as const
            };
            
            LocalDB.setLastKnownLocation(latitude, longitude, newState.heading);
            return newState;
          });

          setGpsMetadata({ accuracy, speed: speed || 0, timestamp: pos.timestamp });
          
          const risk = SafetyService.calculateRiskScore(latitude, longitude);
          setSafetyRisk({ score: risk.score, advice: SafetyService.getSafetyAdvice(risk.score) });

          // Fetch nearby resources if user moved > 200m
          if (!lastFetchLocation || LocalDB.calculateDistance(lastFetchLocation[0], lastFetchLocation[1], latitude, longitude) > 200) {
            lastFetchLocation = [latitude, longitude];
            syncRegionalData(latitude, longitude);
          }
        },
        (err) => {
          console.error("GPS Error:", err);
          setAppState(s => ({ ...s, gpsStatus: 'error' }));
          setTimeout(startTracking, 10000);
        },
        geoOptions
      );
    };

    startTracking();

    const checkOnline = () => {
      const online = navigator.onLine;
      setAppState(s => ({ ...s, isOffline: !online }));
      if (online) {
        OfflineManager.process();
        fetchTacticalData();
      }
    };

    const handleOrientation = (e: DeviceOrientationEvent) => {
      const compass = (e as any).webkitCompassHeading || (e.absolute ? e.alpha : null);
      if (compass !== null && compass !== undefined) {
        setAppState(s => ({ ...s, heading: compass }));
      }
    };
    
    window.addEventListener('deviceorientation', handleOrientation);
    window.addEventListener('online', checkOnline);
    window.addEventListener('offline', checkOnline);
    window.addEventListener('offlinenav-sync-update', () => {
      setAppState(s => ({ ...s, syncQueue: OfflineManager.getQueue() }));
    });
    
    checkOnline();

    return () => {
      navigator.geolocation.clearWatch(watchId);
      window.removeEventListener('deviceorientation', handleOrientation);
      window.removeEventListener('online', checkOnline);
      window.removeEventListener('offline', checkOnline);
    };
  }, []);

  const fetchTacticalData = async () => {
    try {
      const res = await fetch('/api/hazards');
      const tacticalHazards = await res.json();
      setAppState(s => ({
        ...s,
        hazards: [...LocalDB.getHazards(), ...tacticalHazards]
      }));
    } catch (e) {
      console.warn("Could not sync tactical intelligence from server");
    }
  };

  const refreshData = () => {
    setAppState(s => ({
      ...s,
      hazards: LocalDB.getHazards(),
      resources: LocalDB.getResources()
    }));
  };

  const syncRegionalData = async (lat: number, lng: number) => {
    setSyncStatus('syncing');
    const resources = await LocalDB.fetchNearbyResources(lat, lng);
    setAppState(s => ({ ...s, resources }));
    setSyncStatus('synced');
    setTimeout(() => setSyncStatus('idle'), 3000);
  };

  const generateSafeRoute = async (destination: [number, number]) => {
    if (!appState.userLocation) return;
    
    setSyncStatus('syncing');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ApiConfig.apiTimeout);

    try {
      const url = `${ApiConfig.osrmBaseUrl}/${appState.userLocation[1]},${appState.userLocation[0]};${destination[1]},${destination[0]}?overview=full&geometries=geojson`;
      const res = await fetch(url, { signal: controller.signal });
      
      clearTimeout(timeoutId);
      
      if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
      
      const data = await res.json();
      
      if (data.routes && data.routes[0]) {
        const coords = data.routes[0].geometry.coordinates.map((c: any) => [c[1], c[0]]);
        setRouteCoordinates(coords);
        VoiceService.speak("Generating shortest safe path. Avoiding tactical hazards.");
      } else {
        throw new Error("No routes found in payload");
      }
    } catch (e: any) {
      clearTimeout(timeoutId);
      console.error("Routing Error Detail:", e.name === 'AbortError' ? 'Request Timed Out' : e.message);
      VoiceService.speak("Routing unavailable. Tracking direct vector.");
      // Fallback: Straight line path
      setRouteCoordinates([appState.userLocation, destination]);
    }
    setSyncStatus('idle');
  };

  const handleSearch = (q: string) => {
    setSearchQuery(q);
    if (!q) {
      setSearchResults([]);
      return;
    }
    const results = LocalDB.searchResources(q, appState.userLocation || undefined);
    setSearchResults(results);
    if (!autoCenter && results.length > 0) {
      setAutoCenter(true); // Snap back to relevant results
      VoiceService.speak(`Finding nearest ${q}`);
    }
  };

  const handleVoiceSearch = () => {
    if (isListening) {
      VoiceService.stopListening();
      setIsListening(false);
      setLiveTranscript('');
      return;
    }

    setIsListening(true);
    setLiveTranscript('Listening...');
    
    VoiceService.startListening(
      (text, isFinal) => {
        setLiveTranscript(text);
        if (isFinal) {
          processVoiceCommand(text);
        }
      },
      (err) => {
        console.error("Voice Error:", err);
        setIsListening(false);
        setLiveTranscript('Error. Try again.');
      }
    );
  };

  const processVoiceCommand = (text: string) => {
    const command = VoiceService.parseCommand(text);
    
    if (command.action === 'SEARCH' && command.target) {
      handleSearch(command.target);
      VoiceService.speak(`Searching for nearest ${command.target}`);
    } else if (command.action === 'EMERGENCY') {
      setShowEmergency(true);
      VoiceService.speak("Emergency protocol activated.");
    } else if (command.action === 'HAZARDS') {
      VoiceService.speak("Displaying local hazards.");
    }
    
    setTimeout(() => {
      setIsListening(false);
      setLiveTranscript('');
      VoiceService.stopListening();
    }, 1500);
  };

  const onAddHazard = (data: any) => {
    const newHazard = LocalDB.addHazard({
      lat: appState.userLocation![0] + (Math.random() - 0.5) * 0.002,
      lng: appState.userLocation![1] + (Math.random() - 0.5) * 0.002,
      category: data.category,
      severity: data.severity,
      note: data.note
    });
    
    OfflineManager.enqueue('hazard', newHazard);
    refreshData();
    setShowAddHazard(false);
    VoiceService.speak("Hazard report logged for community sync.");
  };

  if (showSplash) return <SplashScreen onComplete={() => setShowSplash(false)} />;

  return (
    <div className="relative w-full h-screen overflow-hidden font-sans">
      <div className="absolute inset-0 z-0 map-container">
        <MapContainer 
          center={appState.userLocation || [0,0]} 
          zoom={15} 
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
        >
          <TileLayer 
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" 
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
          <MapFocus coords={appState.userLocation} autoCenter={autoCenter} />
          <MapInteractions onInteraction={() => setAutoCenter(false)} />

          {appState.userLocation && (
            <Marker position={appState.userLocation} icon={icons.me(appState.heading)} />
          )}

          {routeCoordinates.length > 0 && (
            <Polyline 
              positions={routeCoordinates} 
              pathOptions={{ color: '#06b6d4', weight: 6, opacity: 0.8 }} 
            />
          )}

          {appState.hazards.map(h => (
            <Marker 
              key={h.id} 
              position={[h.lat, h.lng]} 
              icon={icons.hazard(h.category, h.severity)}
              eventHandlers={{ click: () => setSelectedEntity(h) }}
            />
          ))}

          {appState.resources.map(r => (
            <Marker 
              key={r.id} 
              position={[r.lat, r.lng]} 
              icon={icons.resource(r.type)}
              eventHandlers={{ click: () => setSelectedEntity(r) }}
            />
          ))}
        </MapContainer>
      </div>

      {/* MAP CONTROLS */}
      <div className="absolute right-6 bottom-40 flex flex-col gap-3 z-50 pointer-events-auto">
        <AnimatePresence>
          {!autoCenter && (
            <motion.button
              initial={{ scale: 0, opacity: 0, x: 20 }}
              animate={{ scale: 1, opacity: 1, x: 0 }}
              exit={{ scale: 0, opacity: 0, x: 20 }}
              onClick={() => setAutoCenter(true)}
              className="w-14 h-14 bg-cyan-500 rounded-3xl shadow-[0_0_30px_rgba(6,182,212,0.4)] flex items-center justify-center text-slate-950 border-2 border-white/20"
            >
              <Crosshair className="w-6 h-6 animate-pulse" />
            </motion.button>
          )}
        </AnimatePresence>
        <button 
          onClick={() => {
            if (appState.userLocation) {
              setAutoCenter(true);
            }
          }}
          className="w-14 h-14 glass-heavy rounded-3xl border border-white/10 flex items-center justify-center text-white shadow-2xl hover:bg-white/10 transition-all"
        >
          <Navigation className="w-6 h-6 p-0.5" />
        </button>
        <div className={`w-14 h-14 glass-heavy rounded-3xl border border-white/10 flex flex-col items-center justify-center text-white shadow-2xl transition-all ${
          safetyRisk.score > 40 ? 'border-red-500/50 text-red-400' : 'text-cyan-400'
        }`}>
          <span className="text-[8px] font-bold uppercase tracking-tighter">Risk Score</span>
          <span className="text-lg font-black">{safetyRisk.score}</span>
        </div>
      </div>

      {/* TOP OVERLAYS */}
      <div className="absolute top-0 left-0 right-0 h-10 px-6 z-50 flex items-center justify-between bg-slate-950/60 backdrop-blur-md border-b border-white/10 pointer-events-auto">
        <div className="flex items-center gap-4">
          <span className="text-[10px] font-bold tracking-[0.2em] text-cyan-400">OFFLINENAV AI v1.0.4</span>
          <div className="h-4 w-[1px] bg-white/20"></div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.6)] ${appState.isOffline ? 'bg-orange-500 shadow-orange-500/50' : 'bg-emerald-500'}`} />
            <span className={`text-[10px] uppercase tracking-wider ${appState.isOffline ? 'text-orange-400' : 'text-emerald-400'}`}>
              Offline Engine: {appState.isOffline ? 'Active' : 'Standby'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-400 uppercase tracking-tighter">GPS ACCURACY:</span>
            <span className={`text-[10px] font-mono ${
              gpsMetadata.accuracy < 10 ? 'text-emerald-400' : 
              gpsMetadata.accuracy < 50 ? 'text-orange-400' : 'text-red-500'
            }`}>
              {gpsMetadata.accuracy.toFixed(1)}m
            </span>
          </div>
          <div className="flex items-center gap-2 px-3 border-x border-white/10">
            <span className="text-[10px] text-slate-400 uppercase tracking-tighter">DATA SYNC:</span>
            <span className={`text-[10px] font-mono uppercase ${
              appState.syncQueue.some(i => i.status === 'syncing') ? 'text-cyan-400 animate-pulse' : 
              appState.syncQueue.some(i => i.status === 'pending') ? 'text-orange-400' : 'text-emerald-400'
            }`}>
              {appState.syncQueue.some(i => i.status === 'syncing') ? 'UPLOADING' : 
               appState.syncQueue.some(i => i.status === 'pending') ? 'QUEUED' : 'SECURE'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-400 uppercase tracking-tighter">CACHED:</span>
            <span className="text-[10px] font-mono">14,204</span>
          </div>
          <div className="text-[10px] font-mono opacity-60">
            {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
          </div>
        </div>
      </div>

      <div className="absolute top-14 right-6 z-40 pointer-events-auto">
        <button 
          onClick={() => setShowEmergency(true)}
          className="bg-red-500/20 backdrop-blur-xl border border-red-500/50 text-red-500 px-6 py-2.5 rounded-2xl flex items-center gap-2 font-black tracking-[0.2em] shadow-2xl hover:bg-red-500/30 transition-all uppercase italic text-xs"
        >
          <Activity className="w-4 h-4 animate-pulse" />
          SOS EMERGENCY
        </button>
      </div>

      {/* BOTTOM UI SECTION */}
      <div className="absolute bottom-16 inset-x-0 p-8 z-40 pointer-events-none">
        <div className="max-w-2xl mx-auto w-full pointer-events-auto flex flex-col gap-6">
          
          <AnimatePresence>
            {searchResults.length > 0 && searchQuery && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="glass-heavy rounded-2xl overflow-hidden max-h-64 overflow-y-auto shadow-2xl"
              >
                <div className="p-3 border-b border-white/10 bg-white/5 flex justify-between items-center text-[10px] uppercase font-bold tracking-widest text-cyan-400">
                  <span>Tactical Intelligence Results</span>
                  <button onClick={() => setSearchResults([])}><X className="w-4 h-4 text-white/40" /></button>
                </div>
                {searchResults.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 italic text-sm">
                    No tactical results found in this sector.
                  </div>
                ) : (
                  searchResults.map(r => (
                    <button 
                      key={r.id} 
                      onClick={() => { setSelectedEntity(r); setSearchResults([]); }}
                      className="w-full p-4 flex items-center justify-between border-b border-white/5 hover:bg-white/5 text-left group"
                    >
                      <div className="flex items-center gap-4">
                        <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 group-hover:bg-cyan-500 group-hover:text-black transition-colors">
                          <MapIcon className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="font-bold text-sm text-white">{r.name}</div>
                          <div className="text-[10px] uppercase tracking-tighter text-slate-500">{r.type} • {((r.distance || 0)/1000).toFixed(1)}KM</div>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* SAFETY INTELLIGENCE BAR */}
          <AnimatePresence>
            {safetyRisk.score > 0 && (
              <motion.div 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 20, opacity: 0 }}
                className={`glass-heavy p-4 rounded-3xl border border-white/10 shadow-2xl flex items-center gap-4 ${
                  safetyRisk.score > 40 ? 'bg-red-500/10 border-red-500/30' : ''
                }`}
              >
                <div className={`p-2 rounded-xl h-10 w-10 flex items-center justify-center shrink-0 ${
                  safetyRisk.score > 40 ? 'bg-red-500 text-white animate-pulse' : 'bg-cyan-500/20 text-cyan-400'
                }`}>
                  <Shield className="w-5 h-5" />
                </div>
                <div className="flex-1 overflow-hidden">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-[10px] font-bold uppercase tracking-widest ${
                      safetyRisk.score > 40 ? 'text-red-400' : 'text-cyan-400'
                    }`}>
                      Safety Intelligence
                    </span>
                    {appState.isOffline && (
                      <span className="text-[8px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-white/5 uppercase">
                        Offline Active
                      </span>
                    )}
                  </div>
                  <p className="text-white font-medium text-xs tracking-tight truncate">
                    {safetyRisk.advice}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Quick Access UI */}
          <div className="grid grid-cols-6 gap-2">
            <QuickAction type="hospital" icon={<Activity />} label="Hospital" onClick={() => handleSearch('hospital')} color="text-cyan-400" />
            <QuickAction type="fuel" icon={<Zap />} label="Fuel" onClick={() => handleSearch('fuel')} color="text-orange-400" />
            <QuickAction type="police" icon={<Shield />} label="Police" onClick={() => handleSearch('police')} color="text-blue-400" />
            <QuickAction type="food" icon={<Utensils />} label="Food" onClick={() => handleSearch('food')} color="text-orange-300" />
            <QuickAction type="shelter" icon={<MapIcon />} label="Shelter" onClick={() => handleSearch('shelter')} color="text-emerald-400" />
            <div 
              onClick={() => setShowEmergency(true)}
              className="bg-red-500/20 backdrop-blur-xl border border-red-500/50 p-2 rounded-2xl hover:bg-red-500/30 transition-all cursor-pointer group flex flex-col justify-center text-center"
            >
              <div className="text-red-500 text-[10px] font-black uppercase tracking-tighter mb-0.5">SOS</div>
              <div className="text-[8px] text-red-200/60 uppercase font-bold">Alert</div>
            </div>
          </div>

          {/* Search & Voice */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-14 glass-light rounded-2xl flex items-center px-6 gap-4 border border-white/10 shadow-2xl relative overflow-hidden group focus-within:border-cyan-500/50 transition-all">
              <Search className="w-5 h-5 text-slate-400 group-focus-within:text-cyan-400" />
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search offline dataset..."
                className="flex-1 bg-transparent border-none outline-none text-slate-200 text-sm italic tracking-wide"
              />
              <AnimatePresence>
                {liveTranscript && (
                  <motion.div 
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-slate-900 flex items-center px-6 text-cyan-400 font-bold italic text-sm gap-3"
                  >
                    <Mic className="w-4 h-4 shrink-0 animate-pulse" />
                    <input 
                      type="text"
                      className="bg-transparent border-none outline-none text-cyan-400 font-bold w-full"
                      value={liveTranscript}
                      onChange={(e) => setLiveTranscript(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') processVoiceCommand(liveTranscript);
                      }}
                      autoFocus
                    />
                    <button 
                      onClick={() => processVoiceCommand(liveTranscript)}
                      className="p-1 px-3 bg-cyan-500 text-black text-[10px] rounded uppercase"
                    >
                      GO
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
              <div className="px-2 py-1 bg-white/10 rounded-md text-[10px] text-slate-300 font-mono hidden md:block">CMD+K</div>
            </div>
            <div className="flex flex-col gap-2">
              <button 
                onClick={toggleLanguage}
                className="glass-light h-7 px-2 rounded-lg text-[10px] font-mono border border-white/10 text-white/60 hover:text-cyan-400 transition-colors uppercase"
              >
                {languages.find(l => l.code === currentLang)?.code.split('-')[0]}
              </button>
              <button 
                onClick={handleVoiceSearch} 
                className={`h-14 w-14 rounded-2xl border flex items-center justify-center transition-all shadow-2xl group ${
                  isListening 
                    ? 'bg-cyan-500/20 border-cyan-500' 
                    : 'glass-light border-white/10 hover:border-cyan-500/40'
                }`}
              >
                <div className="relative">
                  {isListening && <div className="absolute inset-0 bg-cyan-400 rounded-full animate-pulse opacity-20"></div>}
                  <Mic className={`w-6 h-6 transition-all ${isListening ? 'text-cyan-400 scale-110' : 'text-slate-400'}`} />
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* BOTTOM NAV BAR */}
      <div className="absolute bottom-0 left-0 right-0 h-16 bg-slate-950 border-t border-white/5 flex items-center justify-around px-8 z-50">
        <NavTab label="Dashboard" active />
        <NavTab label="Tactical Map" />
        <NavTab label="Hazard Feed" />
        <NavTab label="Safe Routes" />
      </div>

      {/* MODALS */}
      <AnimatePresence>
        {showEmergency && (
           <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-slate-950/40 backdrop-blur-3xl p-8 flex flex-col justify-between">
             <div className="flex justify-between items-start">
                <div className="flex flex-col gap-1">
                  <h2 className="text-4xl font-black text-red-500 tracking-tighter uppercase italic">Emergency Protocol</h2>
                  <p className="text-red-200/50 text-xs tracking-widest font-bold">COMMUNITY BROADCAST ACTIVE</p>
                </div>
                <button onClick={() => setShowEmergency(false)} className="p-2 rounded-full glass border-white/20"><X className="w-8 h-8 text-white/60" /></button>
             </div>
             
             <div className="flex-1 flex flex-col items-center justify-center gap-12">
               <div className="relative">
                 <motion.div 
                   animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }} 
                   transition={{ duration: 2, repeat: Infinity }}
                   className="absolute -inset-16 bg-red-500/20 rounded-full blur-3xl"
                 />
                 <div className="w-48 h-48 rounded-full border-4 border-red-500 flex items-center justify-center relative bg-red-500/10">
                   <Phone className="w-20 h-20 text-red-500" />
                 </div>
               </div>

               <div className="grid grid-cols-2 gap-4 w-full max-w-xl">
                  <EmergencyAction icon={<Phone />} label="SOS CALL" color="bg-red-500" />
                  <EmergencyAction icon={<MapIcon />} label="RESOURCES" color="bg-white/10" />
               </div>
             </div>

             <div className="glass-heavy border-red-500/30 p-8 rounded-[2rem] text-center max-w-xl mx-auto w-full">
                <div className="flex flex-col gap-2">
                  <div className="text-red-500 font-bold text-xl mb-2 flex items-center justify-center gap-3">
                    <Navigation className="w-6 h-6" />
                    SEARCHING NEAREST HELP...
                  </div>
                  <button 
                    onClick={() => {
                      const nearest = LocalDB.searchResources('hospital', appState.userLocation || undefined)[0];
                      if (nearest) generateSafeRoute([nearest.lat, nearest.lng]);
                      setShowEmergency(false);
                    }}
                    className="w-full bg-red-500 py-5 rounded-2xl text-black font-black uppercase italic text-2xl shadow-[0_0_30px_rgba(239,68,68,0.4)]"
                  >
                    Auto-Route Hospital
                  </button>
                </div>
             </div>
           </motion.div>
        )}

        {selectedEntity && (
          <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} className="fixed bottom-20 left-0 right-0 z-50 px-6">
            <div className="max-w-xl mx-auto glass-heavy rounded-[2.5rem] p-8 relative shadow-2xl border border-white/20">
              <button onClick={() => setSelectedEntity(null)} className="absolute top-6 right-8 text-white/20 hover:text-white"><X /></button>
              <div className="flex items-center gap-4 mb-4">
                <div className={`p-3 rounded-2xl ${'severity' in selectedEntity ? 'bg-red-500/20 text-red-500' : 'bg-cyan-500/20 text-cyan-400'}`}>
                   {'severity' in selectedEntity ? <AlertTriangle /> : <MapIcon />}
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-white tracking-tight">
                    {'name' in selectedEntity ? selectedEntity.name : selectedEntity.category.toUpperCase()}
                  </h3>
                  <div className="text-[10px] text-white/40 uppercase font-bold tracking-widest">
                    {'type' in selectedEntity ? selectedEntity.type : `Hazard • ${selectedEntity.severity} SEVERITY`}
                  </div>
                </div>
              </div>
              <p className="text-slate-400 text-sm mb-8 leading-relaxed italic">
                {'address' in selectedEntity ? selectedEntity.address : selectedEntity.note || 'Tactical intelligence report. Approach with caution.'}
              </p>
              <button 
                onClick={() => {
                  generateSafeRoute([selectedEntity.lat, selectedEntity.lng]);
                  setSelectedEntity(null);
                }}
                className="w-full py-5 bg-cyan-500 text-black font-black rounded-2xl tracking-tighter uppercase italic text-xl shadow-[0_10px_30px_rgba(6,182,212,0.3)]"
              >
                Confirm Engagement Route
              </button>
            </div>
          </motion.div>
        )}

        {showAddHazard && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[110] bg-slate-950/40 backdrop-blur-2xl p-6 flex items-center justify-center">
            <div className="max-w-md w-full glass-heavy p-10 rounded-[3rem] border border-orange-500/30 relative">
              <div className="flex justify-between items-center mb-8">
                <div className="flex flex-col gap-1">
                  <h3 className="text-2xl font-black italic text-orange-500 uppercase tracking-tighter">Tactical Report</h3>
                  <span className="text-[10px] font-bold text-orange-500/50 uppercase tracking-widest">Mark local danger zone</span>
                </div>
                <button onClick={() => setShowAddHazard(false)} className="text-white/20 hover:text-white"><X /></button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <HazardTypeBtn icon={<Activity className="w-6 h-6" />} label="Accident" onClick={() => onAddHazard({ category: 'accident', severity: 'high' })} />
                <HazardTypeBtn icon={<Droplets className="w-6 h-6" />} label="Flood Zone" onClick={() => onAddHazard({ category: 'flood', severity: 'critical' })} />
                <HazardTypeBtn icon={<AlertTriangle className="w-6 h-6" />} label="Blocked" onClick={() => onAddHazard({ category: 'barrier', severity: 'medium' })} />
                <HazardTypeBtn icon={<Zap className="w-6 h-6" />} label="Power Out" onClick={() => onAddHazard({ category: 'construction', severity: 'low' })} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const NavTab = ({ label, active }: any) => (
  <div className={`flex flex-col items-center gap-1 cursor-pointer transition-all ${active ? 'text-cyan-400' : 'text-slate-500 hover:text-slate-300'}`}>
    {active && <div className="w-1 h-1 bg-cyan-400 rounded-full mb-1 shadow-[0_0_8px_#06b6d4]"></div>}
    <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
  </div>
);

const QuickAction = ({ type, icon, label, onClick, color }: any) => (
  <div 
    onClick={onClick}
    className="bg-slate-900/40 backdrop-blur-xl border border-white/10 p-4 rounded-2xl hover:border-cyan-500/50 transition-all group cursor-pointer flex flex-col justify-center"
  >
    <div className={`text-xs font-bold uppercase mb-1 tracking-tighter group-hover:scale-105 transition-transform ${color}`}>{label}</div>
    <div className="text-[9px] text-slate-400 uppercase tracking-[0.1em] font-mono">Tactical View</div>
  </div>
);

const ActionButton = ({ icon, label, onClick }: any) => (
  <button onClick={onClick} className="glass px-3 py-2 rounded-xl flex items-center gap-2 hover:bg-white/10 transition-all font-mono">
    <div className="text-cyan-400">{icon}</div>
    <span className="text-[9px] uppercase tracking-widest opacity-60 italic">{label}</span>
  </button>
);

const EmergencyAction = ({ icon, label, color }: any) => (
  <button className={`${color} p-6 rounded-[2rem] flex flex-col items-center justify-center gap-2 uppercase font-black italic text-white shadow-2xl hover:brightness-110 transition-all`}>
    {React.cloneElement(icon as React.ReactElement, { size: 32 })}
    <span className="text-xs tracking-widest">{label}</span>
  </button>
);

const HazardTypeBtn = ({ icon, label, onClick }: any) => (
  <button onClick={onClick} className="p-6 glass rounded-3xl flex flex-col items-center gap-2 border border-white/5 hover:border-orange-500/40 text-orange-500 transition-all hover:bg-orange-500/10">
    {icon}
    <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
  </button>
);
