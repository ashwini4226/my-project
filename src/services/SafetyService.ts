import { LocalDB } from './LocalDB';
import { HazardReport } from '../types';

export class SafetyService {
  /**
   * Calculates a safety risk score (0-100) for a given location based on nearby hazards.
   * 100 = Extremely Dangerous, 0 = Perfectly Safe
   */
  static calculateRiskScore(lat: number, lng: number): { score: number; nearestHazard?: HazardReport } {
    const hazards = LocalDB.getHazards();
    let maxRisk = 0;
    let closest: HazardReport | undefined;

    hazards.forEach(hazard => {
      const dist = LocalDB.calculateDistance(lat, lng, hazard.lat, hazard.lng);
      
      // Impact radius: 500 meters
      if (dist < 500) {
        let riskValue = 0;
        switch (hazard.severity) {
          case 'critical': riskValue = 50; break;
          case 'high': riskValue = 30; break;
          case 'medium': riskValue = 15; break;
          case 'low': riskValue = 5; break;
        }

        // Distance decay: closer = more dangerous
        const decay = 1 - (dist / 500);
        const weightedRisk = riskValue * (1 + decay);
        
        if (weightedRisk > maxRisk) {
          maxRisk = weightedRisk;
          closest = hazard;
        }
      }
    });

    return { 
      score: Math.min(Math.round(maxRisk), 100),
      nearestHazard: closest
    };
  }

  static getSafetyAdvice(score: number): string {
    if (score > 70) return "EXTREME CAUTION: Critical hazards nearby. Seek shelter.";
    if (score > 40) return "WARNING: Active hazards reported. Avoid major routes.";
    if (score > 10) return "ALERT: Minor congestion or hazards nearby.";
    return "CLEAR: No active hazards in your immediate vicinity.";
  }
}
