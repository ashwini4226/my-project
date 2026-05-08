export class VoiceService {
  private static recognition: any = null;
  private static synthesis = window.speechSynthesis;
  private static currentLanguage = 'en-IN';
  private static isCurrentlyListening = false;

  static init() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = this.currentLanguage;
    }
  }

  static setLanguage(langCode: string) {
    this.currentLanguage = langCode;
    if (this.recognition) this.recognition.lang = langCode;
  }

  static speak(text: string) {
    if (this.synthesis.speaking) this.synthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = this.currentLanguage;
    utterance.pitch = 1.0;
    utterance.rate = 1.0;
    this.synthesis.speak(utterance);
  }

  static isListening() {
    return this.isCurrentlyListening;
  }

  static startListening(onResult: (text: string, isFinal: boolean) => void, onError: (err: any) => void) {
    if (!this.recognition) return onError('Speech recognition not supported');
    
    this.recognition.onstart = () => {
      this.isCurrentlyListening = true;
    };

    this.recognition.onresult = (event: any) => {
      const results = event.results;
      const lastResult = results[results.length - 1];
      const text = lastResult[0].transcript;
      const isFinal = lastResult.isFinal;
      onResult(text, isFinal);
    };
    
    this.recognition.onend = () => {
      this.isCurrentlyListening = false;
    };

    this.recognition.onerror = (err: any) => {
      this.isCurrentlyListening = false;
      onError(err);
    };
    
    try {
      this.recognition.start();
    } catch (e) {
      console.warn("Recognition already started");
    }
  }

  static stopListening() {
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {
        // Already stopped
      }
    }
    this.isCurrentlyListening = false;
  }

  static parseCommand(text: string): { action: string; target?: string } {
    const lower = text.toLowerCase();
    
    // Emergency / SOS
    if (lower.match(/emergency|help|sos|help me|बचाओ|உதவி|ಸಹಾಯ/)) return { action: 'EMERGENCY' };
    
    // Navigation / Search
    if (lower.match(/hospital|medical|doctor|klinik|अस्पताल|மருத்துவமனை/)) return { action: 'SEARCH', target: 'hospital' };
    if (lower.match(/fuel|gas|petrol|diesel|ईंधन|எரிபொருள்|ಇಂಧನ/)) return { action: 'SEARCH', target: 'fuel' };
    if (lower.match(/police|cop|security|station|पुलिस|காவல்துறை/)) return { action: 'SEARCH', target: 'police' };
    if (lower.match(/food|restaurant|eat|hungry|खाना|உணவு/)) return { action: 'SEARCH', target: 'food' };
    if (lower.match(/water|drink|पानी|தண்ணீர்/)) return { action: 'SEARCH', target: 'water' };
    if (lower.match(/shelter|hotel|stay|accommodation|ஆதாரம்/)) return { action: 'SEARCH', target: 'shelter' };
    
    // System Status
    if (lower.match(/hazard|danger|blocked|خतरा|ஆபத்து/)) return { action: 'HAZARDS' };
    if (lower.match(/nearby|around me|पास में/)) return { action: 'SEARCH', target: 'any' };

    return { action: 'UNKNOWN' };
  }
}
