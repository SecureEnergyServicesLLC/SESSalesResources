/**
 * Background Music Controller
 * Plays quiet classical music in the background with mute toggle
 * 
 * SETUP: Download a royalty-free MP3 and place it at: assets/audio/background-music.mp3
 * 
 * Recommended free sources:
 * - https://pixabay.com/music/search/classical%20piano/ (no attribution required)
 * - https://freemusicarchive.org/genre/Classical (check license)
 * - https://musopen.org/music/ (public domain)
 * - https://archive.org/details/classical_music_202209 (public domain)
 *   Direct link: https://archive.org/download/classical_music_202209/Debussy%20-%20Claire%20de%20Lune.mp3
 */

const BackgroundMusic = {
    // Path to your MP3 file - update if you place it elsewhere
    audioPath: 'assets/audio/background-music.mp3',
    
    audio: null,
    isMuted: true, // Start muted due to browser autoplay policies
    isReady: false,
    hasError: false,
    
    init() {
        // Load saved preference
        const savedMute = localStorage.getItem('bgMusicMuted');
        this.isMuted = savedMute !== 'false'; // Default to muted
        
        // Create mute button in top bar
        this.createMuteButton();
        
        // Create audio element
        this.createAudioPlayer();
    },
    
    createAudioPlayer() {
        this.audio = new Audio(this.audioPath);
        this.audio.loop = true;
        this.audio.volume = 0.25; // 25% volume for background music
        this.audio.preload = 'auto';
        
        // Set initial mute state
        this.audio.muted = this.isMuted;
        
        this.audio.addEventListener('canplaythrough', () => {
            this.isReady = true;
            this.updateButtonState();
            console.log('🎵 Background music ready');
            
            // Try to play (will be muted initially)
            this.audio.play().catch(e => {
                // Autoplay blocked - user will need to click unmute
                console.log('Autoplay blocked - click unmute to play');
            });
        });
        
        this.audio.addEventListener('error', (e) => {
            this.hasError = true;
            console.warn('Background music error:', e);
            this.updateButtonState();
        });
    },
    
    createMuteButton() {
        // Create button element
        const btn = document.createElement('button');
        btn.id = 'bgMusicBtn';
        btn.className = 'bg-music-btn';
        btn.title = this.isMuted ? 'Play background music' : 'Mute background music';
        btn.innerHTML = this.getMuteIcon();
        btn.onclick = () => this.toggleMute();
        
        // Add styles
        this.addStyles();
        
        // Insert before theme selector in top bar
        const themeSelector = document.querySelector('.theme-selector');
        if (themeSelector) {
            themeSelector.parentNode.insertBefore(btn, themeSelector);
        }
    },
    
    getMuteIcon() {
        if (this.hasError) {
            // Error icon
            return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                <line x1="23" y1="9" x2="17" y2="15"/>
                <line x1="17" y1="9" x2="23" y2="15"/>
            </svg>`;
        }
        if (this.isMuted) {
            // Muted icon (speaker with X)
            return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                <line x1="23" y1="9" x2="17" y2="15"/>
                <line x1="17" y1="9" x2="23" y2="15"/>
            </svg>`;
        } else {
            // Unmuted icon (speaker with waves)
            return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
            </svg>`;
        }
    },
    
    toggleMute() {
        if (this.hasError) {
            console.log('Audio file not found. Please add an MP3 to: ' + this.audioPath);
            return;
        }
        
        this.isMuted = !this.isMuted;
        
        if (this.audio) {
            this.audio.muted = this.isMuted;
            
            // If unmuting, make sure audio is playing
            if (!this.isMuted) {
                this.audio.play().catch(e => {
                    console.log('Playback failed:', e);
                    this.isMuted = true;
                    this.updateButtonState();
                });
            }
        }
        
        // Save preference
        localStorage.setItem('bgMusicMuted', this.isMuted);
        
        this.updateButtonState();
    },
    
    updateButtonState() {
        const btn = document.getElementById('bgMusicBtn');
        if (btn) {
            btn.innerHTML = this.getMuteIcon();
            
            if (this.hasError) {
                btn.title = 'Music unavailable - check console';
                btn.style.opacity = '0.5';
                btn.classList.remove('unmuted');
            } else {
                btn.title = this.isMuted ? 'Play background music' : 'Mute background music';
                btn.style.opacity = '1';
                btn.classList.toggle('unmuted', !this.isMuted);
            }
        }
    },
    
    addStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .bg-music-btn {
                display: flex;
                align-items: center;
                justify-content: center;
                width: 36px;
                height: 36px;
                border: none;
                border-radius: 8px;
                background: rgba(255, 255, 255, 0.1);
                color: var(--text-secondary, #8b949e);
                cursor: pointer;
                transition: all 0.2s ease;
                margin-right: 12px;
            }
            
            .bg-music-btn:hover {
                background: rgba(255, 255, 255, 0.15);
                color: var(--text-primary, #e6edf3);
            }
            
            .bg-music-btn.unmuted {
                background: rgba(46, 160, 67, 0.2);
                color: #3fb950;
            }
            
            .bg-music-btn.unmuted:hover {
                background: rgba(46, 160, 67, 0.3);
            }
            
            .bg-music-btn svg {
                flex-shrink: 0;
            }
        `;
        document.head.appendChild(style);
    },
    
    // Public methods for external control
    setVolume(level) {
        if (this.audio) {
            this.audio.volume = Math.max(0, Math.min(1, level));
        }
    },
    
    mute() {
        if (!this.isMuted) {
            this.toggleMute();
        }
    },
    
    unmute() {
        if (this.isMuted) {
            this.toggleMute();
        }
    }
};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => BackgroundMusic.init());
} else {
    BackgroundMusic.init();
}
