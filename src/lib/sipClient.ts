import {
    Invitation,
    Inviter,
    Messager,
    Registerer,
    Session,
    UserAgent,
    UserAgentOptions,
} from "sip.js";

// Export these variables so they can be accessed by React components
export let ua: UserAgent;
export let registerer: Registerer;
export let currentSession: Session;
let isOnHold: boolean = false;
// Store the last successfully registered URI for fallback
let lastRegisteredURI: string | null = null;

// Store the last SIP configuration
interface StoredSipConfig {
    uri: string;
    password: string;
    wsServer: string;
    iceServers?: RTCIceServer[];
}

/**
 * Save SIP configuration to localStorage
 * @param config The SIP configuration to save
 */
export function saveSipConfig(config: StoredSipConfig): void {
    if (typeof window !== 'undefined' && window.localStorage) {
        try {
            localStorage.setItem('sipConfig', JSON.stringify(config));
            console.log("✅ SIP configuration saved to localStorage");
        } catch (error) {
            console.error("❌ Error saving SIP configuration to localStorage:", error);
        }
    }
}

/**
 * Load SIP configuration from localStorage
 * @returns The stored SIP configuration or null if not found
 */
export function loadSipConfig(): StoredSipConfig | null {
    if (typeof window !== 'undefined' && window.localStorage) {
        try {
            // First try to load from 'sipConfig'
            const configStr = localStorage.getItem('sipConfig');
            if (configStr) {
                return JSON.parse(configStr) as StoredSipConfig;
            }
            
            // If not found, try to load from 'sipData' (used by SIPRegistration component)
            const sipDataStr = localStorage.getItem('sipData');
            if (sipDataStr) {
                const sipData = JSON.parse(sipDataStr);
                // Convert sipData format to StoredSipConfig format
                if (sipData.username && sipData.password && sipData.wsServer && sipData.domain) {
                    console.log("✅ Found SIP configuration in 'sipData'");
                    const uri = `sip:${sipData.username}@${sipData.domain}`;
                    // Create a StoredSipConfig object from sipData
                    const config: StoredSipConfig = {
                        uri,
                        password: sipData.password,
                        wsServer: sipData.wsServer,
                        iceServers: [
                            { urls: 'stun:stun.l.google.com:19302' },
                            { urls: 'stun:stun1.l.google.com:19302' },
                            { urls: 'stun:stun2.l.google.com:19302' }
                        ]
                    };
                    // Save in the expected format for future use
                    saveSipConfig(config);
                    return config;
                }
            }
        } catch (error) {
            console.error("❌ Error loading SIP configuration from localStorage:", error);
        }
    }
    return null;
}

/**
 * Initialize UserAgent from configuration
 * @param config The SIP configuration to use
 * @returns A promise that resolves when the UserAgent is initialized and registered
 */
export async function initUserAgentFromConfig(config: StoredSipConfig): Promise<boolean> {
    try {
        // Save the configuration for future use
        saveSipConfig(config);
        
        // Initialize SIP with the provided configuration
        await initSIP({
            uri: config.uri,
            password: config.password,
            wsServer: config.wsServer,
            iceServers: config.iceServers,
            onInvite: (invitation) => {
                // Handle incoming invites
                currentSession = invitation;
                
                // Dispatch a custom event for the frontend
                if (typeof window !== 'undefined') {
                    const inviteEvent = new CustomEvent('sip:incoming-invite', {
                        detail: {
                            session: invitation,
                            from: invitation.request.from.uri.toString(),
                            callId: invitation.request.callId
                        }
                    });
                    window.dispatchEvent(inviteEvent);
                    console.log("✅ Dispatched sip:incoming-invite event to frontend");
                }
            }
        });
        
        return true;
    } catch (error) {
        console.error("❌ Error initializing UserAgent from config:", error);
        return false;
    }
}

/**
 * Ensure UserAgent is initialized and ready
 * @returns A promise that resolves when the UserAgent is ready
 */
export async function ensureUaReady(): Promise<boolean> {
    // Check if UserAgent is already initialized and registered
    if (ua && registerer && registerer.state === 'Registered') {
        return true;
    }
    
    // Try to initialize from saved configuration
    const config = loadSipConfig();
    if (config) {
        return await initUserAgentFromConfig(config);
    }
    
    console.error("❌ No saved SIP configuration found");
    return false;
}

// Helper function to get domain from URI or use fallback
function getDomainFromRegisteredURI(): string {
    // Try to get from current UA if available
    if (ua && ua.configuration && ua.configuration.uri) {
        const uriString = ua.configuration.uri.toString();
        const domain = uriString.split('@')[1]?.split(';')[0];
        if (domain) {
            return domain;
        }
    }
    
    // Try to use last registered URI from memory
    if (lastRegisteredURI) {
        const domain = lastRegisteredURI.split('@')[1]?.split(';')[0];
        if (domain) {
            return domain;
        }
    }
    
    // Try to get from localStorage if available
    if (typeof window !== 'undefined' && window.localStorage) {
        const storedURI = localStorage.getItem('lastRegisteredSIPURI');
        if (storedURI) {
            const domain = storedURI.split('@')[1]?.split(';')[0];
            if (domain) {
                return domain;
            }
        }
    }
    
    // Default fallback domain
    return 'jsmwebrtc.my.id';
}

interface SIPConfig {
    uri: string;
    password: string;
    wsServer: string;
    onInvite?: (session: Invitation) => void;
    onMessage?: (message: string, from: string) => void;
    onRegistrationFailed?: (error: Error) => void;
    iceServers?: RTCIceServer[];
}

export function initSIP(config: SIPConfig): Promise<void> {
    return new Promise((resolve, reject) => {
        const { uri, password, wsServer, onInvite, onMessage, onRegistrationFailed, iceServers } = config;
        
        let isPromiseSettled = false;
        let registrationTimeout: NodeJS.Timeout | null = null;
        
        const userAgentOptions: UserAgentOptions = {
            uri: UserAgent.makeURI(uri),
            transportOptions: {
                server: wsServer,
            },
            authorizationUsername: extractUsername(uri),
            authorizationPassword: password,
            sessionDescriptionHandlerFactoryOptions: {
                peerConnectionConfiguration: {
                    iceServers: iceServers || [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:stun1.l.google.com:19302' },
                        { urls: 'stun:stun2.l.google.com:19302' },
                        { urls: 'stun:stun3.l.google.com:19302' },
                        { urls: 'stun:stun4.l.google.com:19302' }
                    ]
                }
            }
        };
        
        function extractUsername(uri: string): string {
            // Handle URI with sip: prefix (sip:username@domain)
            if (uri.includes(':')) {
                const parts = uri.split(':');
                if (parts.length > 1 && parts[1].includes('@')) {
                    return parts[1].split('@')[0];
                }
            }
            
            // Handle URI without prefix (username@domain)
            if (uri.includes('@')) {
                return uri.split('@')[0];
            }
            
            return uri;
        }
        
        const safeResolve = () => {
            if (!isPromiseSettled) {
                isPromiseSettled = true;
                // Clear the timeout if it exists
                if (registrationTimeout) {
                    clearTimeout(registrationTimeout);
                    registrationTimeout = null;
                }
                resolve();
            }
        };
        
        const safeReject = (error: Error) => {
            if (!isPromiseSettled) {
                isPromiseSettled = true;
                // Clear the timeout if it exists
                if (registrationTimeout) {
                    clearTimeout(registrationTimeout);
                    registrationTimeout = null;
                }
                if (onRegistrationFailed) {
                    onRegistrationFailed(error);
                }
                reject(error);
            }
        };
        
        try {
            ua = new UserAgent(userAgentOptions);
            
            ua.delegate = {
                onInvite: (invitation) => {
                    currentSession = invitation;
                    if (onInvite) {
                        onInvite(invitation);
                    }
                },
                onMessage: (message) => {
                    if (onMessage) {
                        const from = message.request.from.uri.toString();
                        const body = message.request.body;
                        onMessage(body, from);
                    }
                }
            };
            
            ua.start().then(() => {
                registerer = new Registerer(ua);
                
                registerer.stateChange.addListener((state) => {
                    console.log(`SIP registration state changed to: ${state}`);
                    switch (state) {
                        case "Registered":
                            console.log("✅ SIP connected and registered");
                            // Store the registered URI for fallback
                            if (ua && ua.configuration && ua.configuration.uri) {
                                const uriString = ua.configuration.uri.toString();
                                lastRegisteredURI = uriString;
                                // Store in localStorage if available
                                if (typeof window !== 'undefined' && window.localStorage) {
                                    localStorage.setItem('lastRegisteredSIPURI', uriString);
                                    console.log("✅ Stored registered URI for fallback:", uriString);
                                }
                            }
                            safeResolve();
                            break;
                        case "Unregistered":
                            console.log("❌ SIP unregistered");
                            if (!isPromiseSettled) {
                                const error = new Error("Registration failed or expired.");
                                console.error("❌ SIP registration failed or expired:", error);
                                safeReject(error);
                            }
                            break;
                        case "Terminated":
                            console.log("❌ SIP registration terminated");
                            break;
                    }
                });
                
                registrationTimeout = setTimeout(() => {
                    if (!isPromiseSettled) {
                        const error = new Error("Registration timed out after 10 seconds.");
                        console.error("❌ SIP registration timed out:", error);
                        safeReject(error);
                    }
                }, 10000);
                
                registerer.register();
            }).catch((error) => {
                console.error("❌ SIP connection failed:", error);
                safeReject(error);
            });
        } catch (error) {
            console.error("❌ Error initializing SIP:", error);
            safeReject(error instanceof Error ? error : new Error(String(error)));
        }
    });
}

// Create or get the remote audio element for playback
let remoteAudio: HTMLAudioElement;
const getRemoteAudioElement = (): HTMLAudioElement => {
    // Check if we already have an audio element
    let audio = document.getElementById('remote-audio') as HTMLAudioElement;
    if (!audio) {
        // Create a new audio element if one doesn't exist
        audio = document.createElement('audio');
        audio.id = 'remote-audio';
        audio.autoplay = true;
        audio.playsInline = true;
        // Add controls for debugging purposes
        audio.controls = true;
        // Hide the element but keep it functional
        audio.style.position = 'absolute';
        audio.style.top = '-1px';
        audio.style.left = '-1px';
        audio.style.width = '1px';
        audio.style.height = '1px';
        document.body.appendChild(audio);
        console.log('✅ Created remote audio element for playback');
    }
    return audio;
};

// STUN/TURN servers configuration for ICE candidates
const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    // Add your TURN servers here if available
    // {
    //   urls: 'turn:your-turn-server.com:3478',
    //   username: 'username',
    //   credential: 'credential'
    // }
];

export async function makeCall(target: string, withVideo = true, userId: string | undefined): Promise<Session> {
    try {
        console.log(`Requesting media permissions: audio=true, video=${withVideo}`);
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: withVideo
        });
        
        const audioTracks = stream.getAudioTracks();
        console.log(`🎤 Got ${audioTracks.length} audio tracks from getUserMedia`);
        audioTracks.forEach((track, index) => {
            console.log(`🎤 Audio track ${index}: enabled=${track.enabled}, muted=${track.muted}, readyState=${track.readyState}`);
            try {
                const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
                const source = audioContext.createMediaStreamSource(new MediaStream([track]));
                const analyser = audioContext.createAnalyser();
                analyser.fftSize = 256;
                source.connect(analyser);
                const dataArray = new Uint8Array(analyser.frequencyBinCount);
                
                const checkAudioLevel = () => {
                    analyser.getByteFrequencyData(dataArray);
                    let sum = 0;
                    for (let i = 0; i < dataArray.length; i++) {
                        sum += dataArray[i];
                    }
                    const average = sum / dataArray.length;
                    console.log(`🎤 Audio track ${index} level: ${average.toFixed(2)}`);
                    
                    if ((window as any).audioLevelChecks < 5) {
                        (window as any).audioLevelChecks++;
                        setTimeout(checkAudioLevel, 500);
                    }
                };
                
                if (typeof (window as any).audioLevelChecks === 'undefined') {
                    (window as any).audioLevelChecks = 0;
                }
                
                checkAudioLevel();
                
                setTimeout(() => {
                    audioContext.close();
                }, 3000);
            } catch (e) {
                console.error('Error checking audio levels:', e);
            }
        });
        
        // Ensure target has the correct format
        let formattedTarget = target;
        
        // If target doesn't have a scheme (sip:), add it
        if (!formattedTarget.startsWith('sip:') && !formattedTarget.startsWith('sips:')) {
            formattedTarget = `sip:${formattedTarget}`;
        }
        
        // If target doesn't have a domain, add the domain from registered URI or fallback
        if (!formattedTarget.includes('@')) {
            // Get domain using the helper function (with fallback mechanisms)
            const domain = getDomainFromRegisteredURI();
            formattedTarget = `${formattedTarget}@${domain}`;
        }
        
        console.log(`Formatted target URI for call: ${formattedTarget}`);
        
        // Create target URI
        let targetURI;
        try {
            targetURI = UserAgent.makeURI(formattedTarget);
            if (!targetURI) {
                throw new Error("Invalid target URI");
            }
        } catch (error) {
            console.error("Error creating target URI for call:", error);
            throw new Error(`Invalid target URI: ${formattedTarget}. Please use format: username@domain or sip:username@domain`);
        }
        
        // Ensure UserAgent is initialized and ready before creating Inviter
        if (!ua) {
            console.log("UserAgent not initialized, attempting to initialize from saved config...");
            const isReady = await ensureUaReady();
            if (!isReady) {
                throw new Error("Failed to initialize UserAgent. Please register first.");
            }
        }
        
        // Check again after initialization attempt
        if (!ua) {
            throw new Error("UserAgent initialization failed. Please register first.");
        }
        
        // Get or create the remote audio element
        remoteAudio = getRemoteAudioElement();
        
        const inviter = new Inviter(ua, targetURI, {
            sessionDescriptionHandlerOptions: {
                constraints: {
                    audio: true,
                    video: withVideo,
                },
                // Add ICE servers configuration
                iceGatheringTimeout: 5000,
                iceServers: iceServers
            },
        });
        
        currentSession = inviter;
        
        // Add handlers to intercept and log SDP
        inviter.stateChange.addListener((state) => {
            if (state === 'Establishing') {
                console.log('Call is establishing, intercepting SDP...');
                
                // Access the session description handler once it's available
                if (inviter.sessionDescriptionHandler) {
                    const sdh = inviter.sessionDescriptionHandler as any;
                    
                    // Store the original send method to intercept it
                    const originalSend = sdh.send;
                    sdh.send = function(description: RTCSessionDescriptionInit) {
                        console.log('🔍 Sending SDP:', description.type);
                        
                        // Parse and log the SDP to check for audio sendrecv
                        const sdpLines = description.sdp?.split('\n') || [];
                        let currentMedia = '';
                        let audioDirection = '';
                        
                        sdpLines.forEach(line => {
                            // Track which media section we're in
                            if (line.startsWith('m=')) {
                                currentMedia = line.split(' ')[0].substring(2);
                                console.log(`🔍 SDP media section: ${line}`);
                            }
                            
                            // Check for direction attributes in audio section
                            if (currentMedia === 'audio' &&
                                (line.includes('a=sendrecv') ||
                                    line.includes('a=sendonly') ||
                                    line.includes('a=recvonly') ||
                                    line.includes('a=inactive'))) {
                                audioDirection = line.trim();
                                console.log(`🔍 Audio direction: ${audioDirection}`);
                            }
                        });
                        
                        if (currentMedia === '') {
                            console.error('❌ No media sections found in SDP!');
                        } else if (audioDirection === '') {
                            console.error('❌ No direction attribute found for audio in SDP!');
                        } else if (audioDirection !== 'a=sendrecv') {
                            console.error(`❌ Audio direction is ${audioDirection}, not a=sendrecv as expected!`);
                        } else {
                            console.log('✅ Audio direction is correctly set to sendrecv');
                        }
                        
                        // Call the original method
                        return originalSend.apply(this, [description]);
                    };
                }
            }
        });
        
        // Try to add tracks immediately if sessionDescriptionHandler is available
        const addTracksToConnection = (session: any, mediaStream: MediaStream) => {
            if (session.sessionDescriptionHandler) {
                const sessionDescriptionHandler = session.sessionDescriptionHandler as any;
                if (sessionDescriptionHandler.peerConnection) {
                    const pc = sessionDescriptionHandler.peerConnection;
                    
                    console.log('🔍 Checking RTCPeerConnection for existing tracks...');
                    
                    // Log the current state of the peer connection
                    console.log(`🔍 RTCPeerConnection state: ${pc.connectionState}`);
                    console.log(`🔍 ICE connection state: ${pc.iceConnectionState}`);
                    console.log(`🔍 Signaling state: ${pc.signalingState}`);
                    
                    // Set up event listeners for ICE connection state changes
                    pc.oniceconnectionstatechange = () => {
                        console.log(`🧊 ICE connection state changed to: ${pc.iceConnectionState}`);
                        if (pc.iceConnectionState === 'failed') {
                            console.error('❌ ICE connection failed - this may indicate a NAT traversal issue');
                            console.log('💡 Tip: Check that STUN/TURN servers are correctly configured and accessible');
                        } else if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
                            console.log('✅ ICE connection established successfully');
                        }
                    };
                    
                    // Set up event listener for connection state changes
                    pc.onconnectionstatechange = () => {
                        console.log(`🔌 Connection state changed to: ${pc.connectionState}`);
                        if (pc.connectionState === 'failed') {
                            console.error('❌ Connection failed');
                        } else if (pc.connectionState === 'connected') {
                            console.log('✅ Connection established successfully');
                        }
                    };
                    
                    // Set up event listener for track events to handle remote audio
                    pc.ontrack = (event: RTCTrackEvent) => {
                        console.log(`🎵 Remote track received: kind=${event.track.kind}, enabled=${event.track.enabled}, readyState=${event.track.readyState}`);
                        
                        if (event.track.kind === 'audio') {
                            // Get the remote audio element
                            const audioElement = getRemoteAudioElement();
                            
                            // Create a new MediaStream with the received track
                            const remoteStream = new MediaStream([event.track]);
                            
                            // Attach the stream to the audio element
                            audioElement.srcObject = remoteStream;
                            
                            // Try to play the audio (this might be blocked by browser autoplay policies)
                            audioElement.play()
                                .then(() => {
                                    console.log('✅ Remote audio playback started successfully');
                                })
                                .catch(error => {
                                    console.error('❌ Remote audio playback failed:', error);
                                    console.log('💡 Tip: This might be due to browser autoplay policies. Try adding a user interaction before playing audio.');
                                    
                                    // Add a one-time click handler to the document to enable audio on user interaction
                                    const enableAudio = () => {
                                        audioElement.play()
                                            .then(() => {
                                                console.log('✅ Remote audio playback started after user interaction');
                                            })
                                            .catch(e => {
                                                console.error('❌ Remote audio playback still failed after user interaction:', e);
                                            });
                                        document.removeEventListener('click', enableAudio);
                                    };
                                    document.addEventListener('click', enableAudio);
                                    console.log('💡 Added click handler to enable audio on user interaction');
                                });
                            
                            // Set up event listeners for the track
                            event.track.onmute = () => console.log('🔇 Remote audio track muted');
                            event.track.onunmute = () => console.log('🔊 Remote audio track unmuted');
                            event.track.onended = () => console.log('🛑 Remote audio track ended');
                        }
                    };
                    
                    // Check if we already have senders with tracks
                    const existingSenders = pc.getSenders();
                    console.log(`🔍 Found ${existingSenders.length} existing senders in peer connection`);
                    
                    // Log details of existing senders
                    existingSenders.forEach((sender: RTCRtpSender, index: number) => {
                        if (sender.track) {
                            console.log(`🔍 Existing sender ${index}: kind=${sender.track.kind}, enabled=${sender.track.enabled}, readyState=${sender.track.readyState}`);
                        } else {
                            console.log(`🔍 Existing sender ${index}: no track attached`);
                        }
                    });
                    
                    const hasAudioSender = existingSenders.some((sender: RTCRtpSender) =>
                        sender.track && sender.track.kind === 'audio' && sender.track.enabled);
                    
                    if (!hasAudioSender) {
                        console.log('🔊 No active audio senders found, adding tracks to connection');
                        
                        // Log the tracks we're about to add
                        const audioTracks = mediaStream.getAudioTracks();
                        const videoTracks = mediaStream.getVideoTracks();
                        console.log(`🔊 Adding ${audioTracks.length} audio tracks and ${videoTracks.length} video tracks to peer connection`);
                        
                        // Add tracks from the stream and store the senders
                        const addedSenders = [];
                        mediaStream.getTracks().forEach(track => {
                            console.log(`🔊 Adding ${track.kind} track to peer connection: enabled=${track.enabled}, muted=${track.muted}, readyState=${track.readyState}`);
                            const sender = pc.addTrack(track, mediaStream);
                            addedSenders.push(sender);
                        });
                        
                        // Verify tracks were added by checking senders again
                        setTimeout(() => {
                            const updatedSenders = pc.getSenders();
                            console.log(`🔍 After adding tracks: ${updatedSenders.length} senders in peer connection`);
                            
                            // Check if audio tracks were actually added
                            const audioSenders = updatedSenders.filter((sender: RTCRtpSender) =>
                                sender.track && sender.track.kind === 'audio' && sender.track.enabled);
                            
                            if (audioSenders.length > 0) {
                                console.log(`✅ Successfully added ${audioSenders.length} audio tracks to peer connection`);
                            } else {
                                console.error('❌ Failed to add audio tracks to peer connection!');
                            }
                        }, 100);
                        
                        return true;
                    } else {
                        console.log('🔊 Active audio senders already exist');
                        return false;
                    }
                } else {
                    console.error('❌ No peerConnection found in sessionDescriptionHandler');
                }
            } else {
                console.error('❌ No sessionDescriptionHandler available yet');
            }
            return false;
        };
        
        // Add state change listener to debug audio issues and add tracks when sessionDescriptionHandler is available
        inviter.stateChange.addListener((newState) => {
            // Try to add tracks when the session is initializing or early in the call setup
            if (newState === 'Establishing') {
                console.log('Call is establishing, trying to add tracks...');
                addTracksToConnection(inviter, stream);
            }
        });
        
        // Add state change listener to debug audio issues
        inviter.stateChange.addListener((state) => {
            console.log(`Call state changed to: ${state}`);
            
            // When call is established, check audio tracks and connection
            if (state === 'Established') {
                console.log('Call established, checking audio tracks and connection...');
                
                if (inviter.sessionDescriptionHandler) {
                    const sessionDescriptionHandler = inviter.sessionDescriptionHandler as any;
                    if (sessionDescriptionHandler.peerConnection) {
                        const pc = sessionDescriptionHandler.peerConnection;
                        
                        // Log RTCPeerConnection state
                        console.log(`RTCPeerConnection state: ${pc.connectionState}`);
                        console.log(`ICE connection state: ${pc.iceConnectionState}`);
                        console.log(`Signaling state: ${pc.signalingState}`);
                        
                        // Check audio senders
                        const senders = pc.getSenders();
                        console.log(`Total RTP senders: ${senders.length}`);
                        
                        // Check if we have any audio senders
                        const audioSenders = senders.filter((sender: RTCRtpSender) => sender.track && sender.track.kind === 'audio');
                        const hasEnabledAudioSender = audioSenders.some((sender: RTCRtpSender) => sender.track && sender.track.enabled);
                        
                        if (audioSenders.length === 0 || !hasEnabledAudioSender) {
                            console.log('❌ No enabled audio tracks found, attempting to add local tracks again...');
                            
                            // Try to get media stream again if needed
                            navigator.mediaDevices.getUserMedia({ audio: true, video: withVideo })
                                .then(newStream => {
                                    // Add tracks from the new stream
                                    newStream.getTracks().forEach(track => {
                                        console.log(`Adding ${track.kind} track to peer connection (retry)`);
                                        pc.addTrack(track, newStream);
                                    });
                                })
                                .catch(err => console.error('Failed to get media on retry:', err));
                        }
                        
                        senders.forEach((sender: RTCRtpSender, index: number) => {
                            if (sender.track) {
                                console.log(`Sender ${index} track kind: ${sender.track.kind}`);
                                console.log(`Sender ${index} track enabled: ${sender.track.enabled}`);
                                console.log(`Sender ${index} track readyState: ${sender.track.readyState}`);
                                console.log(`Sender ${index} track muted: ${sender.track.muted}`);
                                
                                // If it's an audio track, make sure it's enabled
                                if (sender.track.kind === 'audio' && !sender.track.enabled) {
                                    console.log('⚠️ Audio track was disabled, enabling it now');
                                    sender.track.enabled = true;
                                }
                            } else {
                                console.log(`Sender ${index} has no track`);
                            }
                            
                            // Log sender parameters
                            const params = sender.getParameters();
                            console.log(`Sender ${index} parameters:`, params);
                        });
                        
                        // Final check if there are any audio tracks
                        if (audioSenders.length === 0) {
                            console.error('❌ No audio tracks found in the RTCPeerConnection!');
                        } else {
                            // Set up audio level monitoring to verify audio transmission
                            console.log('🎤 Setting up audio transmission monitoring...');
                            
                            try {
                                // Create audio context for monitoring
                                const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
                                
                                // Get the audio track from the first audio sender
                                const audioTrack = audioSenders[0].track;
                                if (audioTrack) {
                                    // Create a media stream with just this audio track
                                    const monitorStream = new MediaStream([audioTrack]);
                                    
                                    // Create source and analyzer
                                    const source = audioContext.createMediaStreamSource(monitorStream);
                                    const analyser = audioContext.createAnalyser();
                                    analyser.fftSize = 256;
                                    source.connect(analyser);
                                    const dataArray = new Uint8Array(analyser.frequencyBinCount);
                                    
                                    // Monitor function to check audio levels during the call
                                    const monitorAudioLevels = () => {
                                        if (currentSession && currentSession.state === 'Established') {
                                            analyser.getByteFrequencyData(dataArray);
                                            let sum = 0;
                                            for (let i = 0; i < dataArray.length; i++) {
                                                sum += dataArray[i];
                                            }
                                            const average = sum / dataArray.length;
                                            
                                            // Log audio level with timestamp
                                            const now = new Date();
                                            const timestamp = `${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}`;
                                            console.log(`🎤 [${timestamp}] Outgoing audio level: ${average.toFixed(2)}`);
                                            
                                            // Check if audio level indicates activity
                                            if (average > 5) {
                                                console.log('✅ Audio activity detected - your microphone is working');
                                            }
                                            
                                            // Continue monitoring
                                            setTimeout(monitorAudioLevels, 2000);
                                        } else {
                                            // Call ended, clean up
                                            console.log('🎤 Audio monitoring stopped - call no longer established');
                                            audioContext.close();
                                        }
                                    };
                                    
                                    // Start monitoring
                                    monitorAudioLevels();
                                    
                                    console.log('✅ Audio transmission monitoring started');
                                } else {
                                    console.error('❌ Could not access audio track for monitoring');
                                }
                            } catch (e) {
                                console.error('❌ Error setting up audio monitoring:', e);
                            }
                        }
                    } else {
                        console.error('❌ No peerConnection found in sessionDescriptionHandler');
                    }
                } else {
                    console.error('❌ No sessionDescriptionHandler found in the session');
                }
            }
        });
        
        // Invite the target
        await inviter.invite();
        
        // Don't stop the stream - SIP.js needs it for the call
        // The stream will be managed by the WebRTC connection
        
        return inviter;
    } catch (error) {
        console.error("Error making call:", error);
        
        // If the error is related to media permissions, provide a more helpful message
        if (error instanceof DOMException &&
            (error.name === "NotAllowedError" || error.name === "PermissionDeniedError")) {
            throw new Error("Microphone or camera access denied. Please allow access in your browser settings.");
        } else if (error instanceof DOMException && error.name === "NotFoundError") {
            throw new Error("No microphone or camera found. Please check your device connections.");
        }
        
        // Re-throw the original error
        throw error;
    }
}

export async function acceptCall(invitation: Invitation, withVideo = true, userId: string | undefined): Promise<void> {
    try {
        // Request media permissions before accepting the call
        console.log(`Requesting media permissions for incoming call: audio=true, video=${withVideo}`);
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: withVideo
        });
        
        // Get or create the remote audio element
        remoteAudio = getRemoteAudioElement();
        
        // Add state change listener to debug audio issues
        invitation.stateChange.addListener((state) => {
            console.log(`Incoming call state changed to: ${state}`);
            
            // When call is established, check audio tracks and connection
            if (state === 'Established') {
                console.log('Incoming call established, checking audio tracks and connection...');
                
                if (invitation.sessionDescriptionHandler) {
                    const sessionDescriptionHandler = invitation.sessionDescriptionHandler as any;
                    if (sessionDescriptionHandler.peerConnection) {
                        const pc = sessionDescriptionHandler.peerConnection;
                        
                        // Log RTCPeerConnection state
                        console.log(`RTCPeerConnection state: ${pc.connectionState}`);
                        console.log(`ICE connection state: ${pc.iceConnectionState}`);
                        console.log(`Signaling state: ${pc.signalingState}`);
                        
                        // Check audio senders
                        const senders = pc.getSenders();
                        console.log(`Total RTP senders: ${senders.length}`);
                        
                        // Check if we have any audio senders
                        const audioSenders = senders.filter((sender: RTCRtpSender) => sender.track && sender.track.kind === 'audio');
                        const hasEnabledAudioSender = audioSenders.some((sender: RTCRtpSender) => sender.track && sender.track.enabled);
                        
                        if (audioSenders.length === 0 || !hasEnabledAudioSender) {
                            console.log('❌ No enabled audio tracks found for incoming call, attempting to add local tracks again...');
                            
                            // Try to get media stream again if needed
                            navigator.mediaDevices.getUserMedia({ audio: true, video: withVideo })
                                .then(newStream => {
                                    // Add tracks from the new stream
                                    newStream.getTracks().forEach(track => {
                                        console.log(`Adding ${track.kind} track to peer connection for incoming call (retry)`);
                                        pc.addTrack(track, newStream);
                                    });
                                })
                                .catch(err => console.error('Failed to get media on retry for incoming call:', err));
                        }
                        
                        senders.forEach((sender: RTCRtpSender, index: number) => {
                            if (sender.track) {
                                console.log(`Sender ${index} track kind: ${sender.track.kind}`);
                                console.log(`Sender ${index} track enabled: ${sender.track.enabled}`);
                                console.log(`Sender ${index} track readyState: ${sender.track.readyState}`);
                                console.log(`Sender ${index} track muted: ${sender.track.muted}`);
                                
                                // If it's an audio track, make sure it's enabled
                                if (sender.track.kind === 'audio' && !sender.track.enabled) {
                                    console.log('⚠️ Audio track was disabled, enabling it now');
                                    sender.track.enabled = true;
                                }
                            } else {
                                console.log(`Sender ${index} has no track`);
                            }
                            
                            // Log sender parameters
                            const params = sender.getParameters();
                            console.log(`Sender ${index} parameters:`, params);
                        });
                        
                        // Final check if there are any audio tracks
                        if (audioSenders.length === 0) {
                            console.error('❌ No audio tracks found in the RTCPeerConnection for incoming call!');
                        }
                    } else {
                        console.error('❌ No peerConnection found in sessionDescriptionHandler');
                    }
                } else {
                    console.error('❌ No sessionDescriptionHandler found in the session');
                }
            }
        });
        
        // Accept the invitation with the requested media constraints and ICE servers
        await invitation.accept({
            sessionDescriptionHandlerOptions: {
                constraints: {
                    audio: true,
                    video: withVideo,
                },
                // Add ICE servers configuration
                iceGatheringTimeout: 5000,
                iceServers: iceServers
            },
        });
        
        // Store the current session
        currentSession = invitation;
        
        // Try to add tracks immediately if sessionDescriptionHandler is available
        const addTracksToConnection = (session: any, mediaStream: MediaStream) => {
            if (session.sessionDescriptionHandler) {
                const sessionDescriptionHandler = session.sessionDescriptionHandler as any;
                if (sessionDescriptionHandler.peerConnection) {
                    const pc = sessionDescriptionHandler.peerConnection;
                    
                    console.log('🔍 Checking RTCPeerConnection for existing tracks (incoming call)...');
                    
                    // Log the current state of the peer connection
                    console.log(`🔍 RTCPeerConnection state: ${pc.connectionState}`);
                    console.log(`🔍 ICE connection state: ${pc.iceConnectionState}`);
                    console.log(`🔍 Signaling state: ${pc.signalingState}`);
                    
                    // Set up event listeners for ICE connection state changes
                    pc.oniceconnectionstatechange = () => {
                        console.log(`🧊 ICE connection state changed to: ${pc.iceConnectionState} (incoming call)`);
                        if (pc.iceConnectionState === 'failed') {
                            console.error('❌ ICE connection failed - this may indicate a NAT traversal issue');
                            console.log('💡 Tip: Check that STUN/TURN servers are correctly configured and accessible');
                        } else if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
                            console.log('✅ ICE connection established successfully (incoming call)');
                        }
                    };
                    
                    // Set up event listener for connection state changes
                    pc.onconnectionstatechange = () => {
                        console.log(`🔌 Connection state changed to: ${pc.connectionState} (incoming call)`);
                        if (pc.connectionState === 'failed') {
                            console.error('❌ Connection failed (incoming call)');
                        } else if (pc.connectionState === 'connected') {
                            console.log('✅ Connection established successfully (incoming call)');
                        }
                    };
                    
                    // Set up event listener for track events to handle remote audio
                    pc.ontrack = (event: RTCTrackEvent) => {
                        console.log(`🎵 Remote track received (incoming call): kind=${event.track.kind}, enabled=${event.track.enabled}, readyState=${event.track.readyState}`);
                        
                        if (event.track.kind === 'audio') {
                            // Get the remote audio element
                            const audioElement = getRemoteAudioElement();
                            
                            // Create a new MediaStream with the received track
                            const remoteStream = new MediaStream([event.track]);
                            
                            // Attach the stream to the audio element
                            audioElement.srcObject = remoteStream;
                            
                            // Try to play the audio (this might be blocked by browser autoplay policies)
                            audioElement.play()
                                .then(() => {
                                    console.log('✅ Remote audio playback started successfully (incoming call)');
                                })
                                .catch(error => {
                                    console.error('❌ Remote audio playback failed (incoming call):', error);
                                    console.log('💡 Tip: This might be due to browser autoplay policies. Try adding a user interaction before playing audio.');
                                    
                                    // Add a one-time click handler to the document to enable audio on user interaction
                                    const enableAudio = () => {
                                        audioElement.play()
                                            .then(() => {
                                                console.log('✅ Remote audio playback started after user interaction (incoming call)');
                                            })
                                            .catch(e => {
                                                console.error('❌ Remote audio playback still failed after user interaction (incoming call):', e);
                                            });
                                        document.removeEventListener('click', enableAudio);
                                    };
                                    document.addEventListener('click', enableAudio);
                                    console.log('💡 Added click handler to enable audio on user interaction (incoming call)');
                                });
                            
                            // Set up event listeners for the track
                            event.track.onmute = () => console.log('🔇 Remote audio track muted (incoming call)');
                            event.track.onunmute = () => console.log('🔊 Remote audio track unmuted (incoming call)');
                            event.track.onended = () => console.log('🛑 Remote audio track ended (incoming call)');
                        }
                    };
                    
                    // Check if we already have senders with tracks
                    const existingSenders = pc.getSenders();
                    const hasAudioSender = existingSenders.some((sender: RTCRtpSender) =>
                        sender.track && sender.track.kind === 'audio' && sender.track.enabled);
                    
                    if (!hasAudioSender) {
                        console.log('No active audio senders found, adding tracks to connection for incoming call');
                        
                        // Add tracks from the stream
                        mediaStream.getTracks().forEach(track => {
                            console.log(`Adding ${track.kind} track to peer connection for incoming call`);
                            pc.addTrack(track, mediaStream);
                        });
                        
                        return true;
                    } else {
                        console.log('Active audio senders already exist for incoming call');
                        return false;
                    }
                } else {
                    console.error('❌ No peerConnection found in sessionDescriptionHandler for incoming call');
                }
            } else {
                console.error('❌ No sessionDescriptionHandler available yet for incoming call');
            }
            return false;
        };
        
        // Add state change listener to add tracks when sessionDescriptionHandler is available
        invitation.stateChange.addListener((newState) => {
            // Try to add tracks when the session is establishing or early in the call setup
            if (newState === 'Establishing') {
                console.log('Incoming call is establishing, trying to add tracks...');
                addTracksToConnection(invitation, stream);
            }
        });
        
        // Don't stop the stream - SIP.js needs it for the call
        // The stream will be managed by the WebRTC connection
    } catch (error) {
        console.error("Error accepting call:", error);
        
        // If the error is related to media permissions, provide a more helpful message
        if (error instanceof DOMException &&
            (error.name === "NotAllowedError" || error.name === "PermissionDeniedError")) {
            throw new Error("Microphone or camera access denied. Please allow access in your browser settings.");
        } else if (error instanceof DOMException && error.name === "NotFoundError") {
            throw new Error("No microphone or camera found. Please check your device connections.");
        }
        
        // Reject the call if we couldn't accept it
        try {
            invitation.reject();
        } catch (rejectError) {
            console.error("Error rejecting call after failed accept:", rejectError);
        }
        
        // Re-throw the original error
        throw error;
    }
}

export function hangupCall() {
    if (currentSession) {
        // Store a reference to the current session
        const session = currentSession;
        
        if (session.state === "Established") {
            session.bye();
        } else if (session.state === "Initial") {
            // Check if the session is an Inviter before calling cancel()
            if (session instanceof Inviter) {
                session.cancel();
            }
            // Check if the session is an Invitation (incoming call) and reject it
            else if (session instanceof Invitation) {
                session.reject();
            }
        }
        
        // Clean up the session reference immediately to prevent further operations on it
        currentSession = null as unknown as Session;
        
        // Add a one-time listener to handle any final cleanup after termination
        const stateChangeListener = (state: string) => {
            if (state === "Terminated") {
                console.log("Session terminated and cleaned up");
                // Remove the listener to prevent memory leaks
                session.stateChange.removeListener(stateChangeListener);
            }
        };
        
        session.stateChange.addListener(stateChangeListener);
    }
}

export function muteCall(mute: boolean) {
    if (!currentSession) return false;
    
    try {
        if (currentSession.sessionDescriptionHandler) {
            // Use type assertion to access peerConnection
            const sessionDescriptionHandler = currentSession.sessionDescriptionHandler as any;
            if (sessionDescriptionHandler.peerConnection) {
                const pc = sessionDescriptionHandler.peerConnection;
                pc.getSenders().forEach((sender: RTCRtpSender) => {
                    if (sender.track && sender.track.kind === 'audio') {
                        sender.track.enabled = !mute;
                    }
                });
                return true;
            }
        }
    } catch (error) {
        console.error("Error muting call:", error);
    }
    return false;
}

export function sendMessage(target: string, message: string): Promise<void> {
    return new Promise(async (resolve, reject) => {
        try {
            console.log(`Sending message to ${target}: ${message}`);
            
            // Check if UA is initialized
            if (!ua) {
                console.log("UserAgent not initialized, attempting to initialize from saved config...");
                const isReady = await ensureUaReady();
                if (!isReady) {
                    const error = new Error("Failed to initialize UserAgent. Please register first.");
                    console.error(error);
                    return reject(error);
                }
            }
            
            // Check again after initialization attempt
            if (!ua) {
                const error = new Error("UserAgent initialization failed. Please register first.");
                console.error(error);
                return reject(error);
            }
            
            // Ensure target has the correct format
            let formattedTarget = target;
            
            // If target doesn't have a scheme (sip:), add it
            if (!formattedTarget.startsWith('sip:') && !formattedTarget.startsWith('sips:')) {
                formattedTarget = `sip:${formattedTarget}`;
            }
            
            // If target doesn't have a domain, add the domain from registered URI or fallback
            if (!formattedTarget.includes('@')) {
                // Get domain using the helper function (with fallback mechanisms)
                const domain = getDomainFromRegisteredURI();
                formattedTarget = `${formattedTarget}@${domain}`;
            }
            
            console.log(`Formatted target URI: ${formattedTarget}`);
            
            // Create target URI
            let targetURI;
            try {
                targetURI = UserAgent.makeURI(formattedTarget);
                if (!targetURI) {
                    throw new Error("Invalid target URI");
                }
            } catch (error) {
                console.error("Error creating target URI:", error);
                return reject(new Error(`Invalid target URI: ${formattedTarget}. Please use format: username@domain or sip:username@domain`));
            }
            
            // Create messager and send message
            const messager = new Messager(ua, targetURI, message);
            
            // Send the message and handle the response
            messager.message({
                requestDelegate: {
                    onAccept: () => {
                        console.log(`✅ Message to ${formattedTarget} accepted by server`);
                        resolve();
                    },
                    onReject: (response) => {
                        const error = new Error(`Message rejected: ${response.message.reasonPhrase}`);
                        console.error(error);
                        reject(error);
                    },
                    onTrying: (response) => {
                        console.log(`Message to ${formattedTarget} trying: ${response.message.reasonPhrase}`);
                    }
                }
            });
        } catch (error) {
            console.error("Error sending message:", error);
            reject(error instanceof Error ? error : new Error(String(error)));
        }
    });
}

export async function transferCall(target: string) {
    if (!currentSession) return false;
    
    try {
        // Ensure UserAgent is initialized and ready before transferring call
        if (!ua) {
            console.log("UserAgent not initialized, attempting to initialize from saved config...");
            const isReady = await ensureUaReady();
            if (!isReady) {
                console.error("Failed to initialize UserAgent. Please register first.");
                return false;
            }
        }
        
        // Check again after initialization attempt
        if (!ua) {
            console.error("UserAgent initialization failed. Please register first.");
            return false;
        }
        
        if (currentSession instanceof Inviter) {
            // Ensure target has the correct format
            let formattedTarget = target;
            
            // If target doesn't have a scheme (sip:), add it
            if (!formattedTarget.startsWith('sip:') && !formattedTarget.startsWith('sips:')) {
                formattedTarget = `sip:${formattedTarget}`;
            }
            
            // If target doesn't have a domain, add the domain from registered URI or fallback
            if (!formattedTarget.includes('@')) {
                // Get domain using the helper function (with fallback mechanisms)
                const domain = getDomainFromRegisteredURI();
                formattedTarget = `${formattedTarget}@${domain}`;
            }
            
            console.log(`Formatted target URI for transfer: ${formattedTarget}`);
            
            // Create target URI
            let targetURI;
            try {
                targetURI = UserAgent.makeURI(formattedTarget);
                if (!targetURI) {
                    throw new Error("Invalid target URI");
                }
            } catch (error) {
                console.error("Error creating target URI for transfer:", error);
                throw new Error(`Invalid target URI: ${formattedTarget}. Please use format: username@domain or sip:username@domain`);
            }
            
            currentSession.refer(targetURI);
            return true;
        }
    } catch (error) {
        console.error("Error transferring call:", error);
    }
    return false;
}

export function holdCall(hold: boolean) {
    if (!currentSession) return false;
    
    try {
        if (currentSession.sessionDescriptionHandler) {
            isOnHold = hold;
            const pc = (currentSession.sessionDescriptionHandler as any).peerConnection;
            
            // Toggle all audio and video tracks
            pc.getSenders().forEach((sender: RTCRtpSender) => {
                if (sender.track) {
                    sender.track.enabled = !hold;
                }
            });
            
            return true;
        }
    } catch (error) {
        console.error("Error holding call:", error);
    }
    return false;
}

export function sendDtmf(tone: string) {
    if (!currentSession) return false;
    
    try {
        if (currentSession.sessionDescriptionHandler) {
            currentSession.sessionDescriptionHandler.sendDtmf(tone);
            return true;
        }
    } catch (error) {
        console.error("Error sending DTMF tone:", error);
    }
    return false;
}

export function getCallState() {
    if (!currentSession) return "Idle";
    try {
        return currentSession.state;
    } catch (error) {
        console.error("Error getting call state:", error);
        return "Idle";
    }
}

export function isCallOnHold() {
    return isOnHold;
}

// Function to test microphone and verify it's working
export async function testMicrophone(): Promise<{ success: boolean; message: string; audioLevel?: number }> {
    try {
        console.log('🎤 Testing microphone...');
        
        // Request microphone access
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const audioTracks = stream.getAudioTracks();
        
        if (audioTracks.length === 0) {
            return {
                success: false,
                message: 'No audio tracks found. Your microphone might not be working or is not accessible.'
            };
        }
        
        console.log(`🎤 Got ${audioTracks.length} audio tracks from getUserMedia`);
        
        // Create audio context to analyze audio levels
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        
        // Check audio levels
        return new Promise((resolve) => {
            let maxLevel = 0;
            let checkCount = 0;
            
            const checkAudioLevel = () => {
                analyser.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) {
                    sum += dataArray[i];
                }
                const average = sum / dataArray.length;
                console.log(`🎤 Audio level: ${average.toFixed(2)}`);
                
                if (average > maxLevel) {
                    maxLevel = average;
                }
                
                checkCount++;
                if (checkCount < 10) {
                    // Continue checking for about 2 seconds
                    setTimeout(checkAudioLevel, 200);
                } else {
                    // Clean up
                    stream.getTracks().forEach(track => track.stop());
                    audioContext.close();
                    
                    // Determine result
                    if (maxLevel > 10) {
                        resolve({
                            success: true,
                            message: 'Microphone is working and detecting audio.',
                            audioLevel: maxLevel
                        });
                    } else if (maxLevel > 0) {
                        resolve({
                            success: true,
                            message: 'Microphone is working but audio level is low. Try speaking louder or check microphone settings.',
                            audioLevel: maxLevel
                        });
                    } else {
                        resolve({
                            success: false,
                            message: 'No audio detected. Your microphone might be muted or not working properly.',
                            audioLevel: 0
                        });
                    }
                }
            };
            
            // Start checking audio levels
            checkAudioLevel();
            
            // Prompt user to speak
            console.log('🗣️ Please speak into your microphone to test audio levels...');
        });
    } catch (error) {
        console.error('Error testing microphone:', error);
        
        // Provide more helpful error messages based on the error type
        if (error instanceof DOMException) {
            if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                return {
                    success: false,
                    message: 'Microphone access denied. Please allow microphone access in your browser settings.'
                };
            } else if (error.name === 'NotFoundError') {
                return {
                    success: false,
                    message: 'No microphone found. Please check your device connections.'
                };
            }
        }
        
        return {
            success: false,
            message: `Error accessing microphone: ${error instanceof Error ? error.message : String(error)}`
        };
    }
}

// Function to analyze SDP and verify audio codecs
export function analyzeSdp(): { success: boolean; message: string; details: any } {
    if (!currentSession) {
        return {
            success: false,
            message: 'No active session to analyze',
            details: { error: 'No active session' }
        };
    }
    
    try {
        const result: any = {
            sessionState: currentSession.state,
            audio: {
                local: { direction: null, codecs: [] },
                remote: { direction: null, codecs: [] }
            },
            ice: {
                candidates: { local: 0, remote: 0 },
                state: null
            }
        };
        
        // Get session description handler
        if (currentSession.sessionDescriptionHandler) {
            const sdh = currentSession.sessionDescriptionHandler as any;
            
            // Get peer connection
            if (sdh.peerConnection) {
                const pc = sdh.peerConnection;
                
                // Get ICE connection state
                result.ice.state = pc.iceConnectionState;
                
                // Get local and remote descriptions
                const localSdp = pc.localDescription?.sdp;
                const remoteSdp = pc.remoteDescription?.sdp;
                
                // Analyze local SDP
                if (localSdp) {
                    console.log('Analyzing local SDP...');
                    const localSdpLines = localSdp.split('\n');
                    let currentMedia = '';
                    let inAudioSection = false;
                    
                    localSdpLines.forEach((line: string) => {
                        // Track which media section we're in
                        if (line.startsWith('m=')) {
                            currentMedia = line.split(' ')[0].substring(2);
                            inAudioSection = currentMedia === 'audio';
                            
                            if (inAudioSection) {
                                // Extract codec payload types from the m=audio line
                                // Format: m=audio 9 UDP/TLS/RTP/SAVPF 111 103 104 9 0 8 106 105 13 110 112 113 126
                                const payloadTypes = line.split(' ').slice(3);
                                result.audio.local.payloadTypes = payloadTypes;
                            }
                        }
                        
                        // Check for direction attributes in audio section
                        if (inAudioSection &&
                            (line.includes('a=sendrecv') ||
                             line.includes('a=sendonly') ||
                             line.includes('a=recvonly') ||
                             line.includes('a=inactive'))) {
                            result.audio.local.direction = line.trim().substring(2); // Remove 'a='
                        }
                        
                        // Extract codec information from rtpmap lines in audio section
                        // Format: a=rtpmap:111 opus/48000/2
                        if (inAudioSection && line.startsWith('a=rtpmap:')) {
                            const parts = line.substring(9).split(' '); // Remove 'a=rtpmap:'
                            const payloadType = parts[0];
                            const codecInfo = parts[1].split('/');
                            const codec = {
                                payloadType,
                                name: codecInfo[0],
                                clockRate: codecInfo[1],
                                channels: codecInfo[2] || '1'
                            };
                            result.audio.local.codecs.push(codec);
                        }
                        
                        // Count ICE candidates
                        if (line.startsWith('a=candidate:')) {
                            result.ice.candidates.local++;
                        }
                    });
                }
                
                // Analyze remote SDP
                if (remoteSdp) {
                    console.log('Analyzing remote SDP...');
                    const remoteSdpLines = remoteSdp.split('\n');
                    let currentMedia = '';
                    let inAudioSection = false;
                    
                    remoteSdpLines.forEach((line: string) => {
                        // Track which media section we're in
                        if (line.startsWith('m=')) {
                            currentMedia = line.split(' ')[0].substring(2);
                            inAudioSection = currentMedia === 'audio';
                            
                            if (inAudioSection) {
                                // Extract codec payload types from the m=audio line
                                const payloadTypes = line.split(' ').slice(3);
                                result.audio.remote.payloadTypes = payloadTypes;
                            }
                        }
                        
                        // Check for direction attributes in audio section
                        if (inAudioSection &&
                            (line.includes('a=sendrecv') ||
                             line.includes('a=sendonly') ||
                             line.includes('a=recvonly') ||
                             line.includes('a=inactive'))) {
                            result.audio.remote.direction = line.trim().substring(2); // Remove 'a='
                        }
                        
                        // Extract codec information from rtpmap lines in audio section
                        if (inAudioSection && line.startsWith('a=rtpmap:')) {
                            const parts = line.substring(9).split(' '); // Remove 'a=rtpmap:'
                            const payloadType = parts[0];
                            const codecInfo = parts[1].split('/');
                            const codec = {
                                payloadType,
                                name: codecInfo[0],
                                clockRate: codecInfo[1],
                                channels: codecInfo[2] || '1'
                            };
                            result.audio.remote.codecs.push(codec);
                        }
                        
                        // Count ICE candidates
                        if (line.startsWith('a=candidate:')) {
                            result.ice.candidates.remote++;
                        }
                    });
                }
                
                // Analyze the results to determine if audio should work
                let audioShouldWork = true;
                let message = 'Audio appears to be properly configured.';
                const issues = [];
                
                // Check audio directions
                if (result.audio.local.direction && result.audio.remote.direction) {
                    const localCanSend = result.audio.local.direction === 'sendrecv' || result.audio.local.direction === 'sendonly';
                    const localCanReceive = result.audio.local.direction === 'sendrecv' || result.audio.local.direction === 'recvonly';
                    const remoteCanSend = result.audio.remote.direction === 'sendrecv' || result.audio.remote.direction === 'sendonly';
                    const remoteCanReceive = result.audio.remote.direction === 'sendrecv' || result.audio.remote.direction === 'recvonly';
                    
                    // For audio to work in both directions:
                    // 1. Local must be able to send and remote must be able to receive (for local->remote audio)
                    // 2. Remote must be able to send and local must be able to receive (for remote->local audio)
                    
                    if (!(localCanSend && remoteCanReceive)) {
                        issues.push('Local audio cannot be sent to remote (check local sendrecv/sendonly and remote sendrecv/recvonly)');
                        audioShouldWork = false;
                    }
                    
                    if (!(remoteCanSend && localCanReceive)) {
                        issues.push('Remote audio cannot be sent to local (check remote sendrecv/sendonly and local sendrecv/recvonly)');
                        audioShouldWork = false;
                    }
                } else {
                    issues.push('Missing audio direction attributes in SDP');
                    audioShouldWork = false;
                }
                
                // Check for matching codecs
                const matchingCodecs = result.audio.local.codecs.filter(localCodec =>
                    result.audio.remote.codecs.some(remoteCodec =>
                        localCodec.name.toLowerCase() === remoteCodec.name.toLowerCase()
                    )
                );
                
                if (matchingCodecs.length === 0) {
                    issues.push('No matching audio codecs found between local and remote');
                    audioShouldWork = false;
                }
                
                // Check ICE candidates
                if (result.ice.candidates.local === 0 || result.ice.candidates.remote === 0) {
                    issues.push('Missing ICE candidates (local: ' + result.ice.candidates.local +
                                ', remote: ' + result.ice.candidates.remote + ')');
                    audioShouldWork = false;
                }
                
                // Check ICE connection state
                if (result.ice.state !== 'connected' && result.ice.state !== 'completed') {
                    issues.push('ICE connection is not established (state: ' + result.ice.state + ')');
                    audioShouldWork = false;
                }
                
                if (!audioShouldWork) {
                    message = 'Audio issues detected: ' + issues.join('; ');
                }
                
                return {
                    success: audioShouldWork,
                    message: message,
                    details: result
                };
            } else {
                return {
                    success: false,
                    message: 'No peer connection found in session description handler',
                    details: { error: 'No peer connection found' }
                };
            }
        } else {
            return {
                success: false,
                message: 'No session description handler found in session',
                details: { error: 'No session description handler found' }
            };
        }
    } catch (error) {
        console.error('Error analyzing SDP:', error);
        return {
            success: false,
            message: 'Error analyzing SDP: ' + (error instanceof Error ? error.message : String(error)),
            details: { error: String(error) }
        };
    }
}

/**
 * Debug function to check and fix audio tracks in the current call
 * Also provides suggestions for Asterisk/SIP server configuration
 * @returns Object with diagnostic information
 */
export function debugAudioTracks() {
    if (!currentSession) {
        console.log('No active call to debug');
        return { status: 'error', message: 'No active call' };
    }
    
    try {
        console.log('🔍 Comprehensive audio debugging for current call...');
        
        if (!currentSession.sessionDescriptionHandler) {
            console.error('❌ No sessionDescriptionHandler found in the session');
            return { status: 'error', message: 'No sessionDescriptionHandler found' };
        }
        
        const sessionDescriptionHandler = currentSession.sessionDescriptionHandler as any;
        if (!sessionDescriptionHandler.peerConnection) {
            console.error('❌ No peerConnection found in sessionDescriptionHandler');
            return { status: 'error', message: 'No peerConnection found' };
        }
        
        const pc = sessionDescriptionHandler.peerConnection;
        
        // Log RTCPeerConnection state
        console.log(`🔍 RTCPeerConnection state: ${pc.connectionState}`);
        console.log(`🔍 ICE connection state: ${pc.iceConnectionState}`);
        console.log(`🔍 Signaling state: ${pc.signalingState}`);
        
        // Check audio senders
        const senders = pc.getSenders();
        console.log(`🔍 Total RTP senders: ${senders.length}`);
        
        const trackInfo: Array<{
            index: number;
            kind?: string;
            enabled?: boolean;
            readyState?: string;
            muted?: boolean;
            fixed?: boolean;
            noTrack?: boolean;
        }> = [];
        let fixedTracks = 0;
        let hasAudioSender = false;
        
        senders.forEach((sender: RTCRtpSender, index: number) => {
            if (sender.track) {
                const info = {
                    index,
                    kind: sender.track.kind,
                    enabled: sender.track.enabled,
                    readyState: sender.track.readyState,
                    muted: sender.track.muted,
                    fixed: false
                };
                
                console.log(`🔍 Sender ${index} track kind: ${sender.track.kind}`);
                console.log(`🔍 Sender ${index} track enabled: ${sender.track.enabled}`);
                console.log(`🔍 Sender ${index} track readyState: ${sender.track.readyState}`);
                console.log(`🔍 Sender ${index} track muted: ${sender.track.muted}`);
                
                // If it's an audio track, make sure it's enabled
                if (sender.track.kind === 'audio') {
                    hasAudioSender = true;
                    if (!sender.track.enabled) {
                        console.log(`⚠️ Audio track ${index} was disabled, enabling it now`);
                        sender.track.enabled = true;
                        info.fixed = true;
                        fixedTracks++;
                    }
                }
                
                trackInfo.push(info);
            } else {
                console.log(`🔍 Sender ${index} has no track`);
                trackInfo.push({ index, noTrack: true });
            }
            
            // Log sender parameters
            try {
                const params = sender.getParameters();
                console.log(`🔍 Sender ${index} parameters:`, params);
                
                // Check if sender has encodings and they're active
                if (params.encodings) {
                    params.encodings.forEach((encoding: RTCRtpEncodingParameters, i: number) => {
                        console.log(`🔍 Sender ${index} encoding ${i} active: ${encoding.active !== false}`);
                        if (encoding.active === false && sender.track && sender.track.kind === 'audio') {
                            console.log(`⚠️ Audio encoding is inactive, attempting to activate...`);
                            encoding.active = true;
                            try {
                                sender.setParameters(params);
                                console.log(`✅ Successfully activated audio encoding`);
                            } catch (e) {
                                console.error(`❌ Failed to activate audio encoding:`, e);
                            }
                        }
                    });
                }
            } catch (e) {
                console.log(`🔍 Could not get parameters for sender ${index}:`, e);
            }
        });
        
        // Check SDP for audio direction
        let localSdp = '';
        let remoteSdp = '';
        
        try {
            if (pc.localDescription && pc.localDescription.sdp) {
                localSdp = pc.localDescription.sdp;
                console.log(`🔍 Analyzing local SDP (${pc.localDescription.type})...`);
                
                // Parse SDP to check audio direction
                const sdpLines = localSdp.split('\n');
                let currentMedia = '';
                let audioDirection = '';
                
                sdpLines.forEach((line: string) => {
                    // Track which media section we're in
                    if (line.startsWith('m=')) {
                        currentMedia = line.split(' ')[0].substring(2);
                        console.log(`🔍 SDP media section: ${line}`);
                    }
                    
                    // Check for direction attributes in audio section
                    if (currentMedia === 'audio' &&
                        (line.includes('a=sendrecv') ||
                            line.includes('a=sendonly') ||
                            line.includes('a=recvonly') ||
                            line.includes('a=inactive'))) {
                        audioDirection = line.trim();
                        console.log(`🔍 Local audio direction: ${audioDirection}`);
                    }
                });
                
                if (audioDirection !== 'a=sendrecv') {
                    console.error(`❌ Local audio direction is ${audioDirection}, not a=sendrecv as expected!`);
                } else {
                    console.log('✅ Local audio direction is correctly set to sendrecv');
                }
            }
            
            if (pc.remoteDescription && pc.remoteDescription.sdp) {
                remoteSdp = pc.remoteDescription.sdp;
                console.log(`🔍 Analyzing remote SDP (${pc.remoteDescription.type})...`);
                
                // Parse SDP to check audio direction
                const sdpLines = remoteSdp.split('\n');
                let currentMedia = '';
                let audioDirection = '';
                
                sdpLines.forEach((line: string) => {
                    // Track which media section we're in
                    if (line.startsWith('m=')) {
                        currentMedia = line.split(' ')[0].substring(2);
                        console.log(`🔍 SDP media section: ${line}`);
                    }
                    
                    // Check for direction attributes in audio section
                    if (currentMedia === 'audio' &&
                        (line.includes('a=sendrecv') ||
                            line.includes('a=sendonly') ||
                            line.includes('a=recvonly') ||
                            line.includes('a=inactive'))) {
                        audioDirection = line.trim();
                        console.log(`🔍 Remote audio direction: ${audioDirection}`);
                    }
                });
                
                if (audioDirection !== 'a=sendrecv') {
                    console.error(`❌ Remote audio direction is ${audioDirection}, not a=sendrecv as expected!`);
                } else {
                    console.log('✅ Remote audio direction is correctly set to sendrecv');
                }
            }
        } catch (e) {
            console.error('❌ Error analyzing SDP:', e);
        }
        
        // Check if there are any audio tracks
        const audioSenders = senders.filter((sender: RTCRtpSender) => sender.track && sender.track.kind === 'audio');
        if (audioSenders.length === 0) {
            console.error('❌ No audio tracks found in the RTCPeerConnection!');
            
            // Provide troubleshooting suggestions
            console.log('\n🔧 TROUBLESHOOTING SUGGESTIONS:');
            console.log('1. Check if microphone permissions are granted in browser');
            console.log('2. Verify microphone is working with another application');
            console.log('3. Try a different microphone if available');
            console.log('4. Restart the browser and try again');
            console.log('5. Check Asterisk/SIP server configuration (see below)');
            
            return {
                status: 'error',
                message: 'No audio tracks found',
                connectionState: pc.connectionState,
                iceConnectionState: pc.iceConnectionState,
                signalingState: pc.signalingState,
                tracks: trackInfo,
                localSdp: localSdp,
                remoteSdp: remoteSdp
            };
        }
        
        // Provide Asterisk/SIP server configuration suggestions
        console.log('\n🔧 ASTERISK/SIP SERVER CONFIGURATION SUGGESTIONS:');
        console.log('If you can hear the other party but they cannot hear you, check:');
        console.log('1. Ensure NAT traversal is properly configured on the server');
        console.log('2. Check if the server is configured to allow audio in both directions');
        console.log('3. Verify that the SIP server is not blocking or filtering RTP packets');
        console.log('4. Check firewall settings to ensure RTP ports are open (typically 10000-20000)');
        console.log('5. For Asterisk specifically, check:');
        console.log('   - directmedia=no in sip.conf or pjsip.conf to force RTP through the server');
        console.log('   - nat=yes in sip.conf or pjsip.conf');
        console.log('   - Check for any media filtering or transformation rules');
        console.log('   - Verify that the codec negotiation is working correctly');
        console.log('6. Try enabling STUN/TURN if not already enabled');
        
        return {
            status: 'success',
            message: fixedTracks > 0 ? `Fixed ${fixedTracks} audio tracks` : 'All audio tracks are properly configured',
            connectionState: pc.connectionState,
            iceConnectionState: pc.iceConnectionState,
            signalingState: pc.signalingState,
            tracks: trackInfo,
            localSdp: localSdp,
            remoteSdp: remoteSdp,
            suggestions: [
                'Ensure NAT traversal is properly configured on the server',
                'Check if the server is configured to allow audio in both directions',
                'Verify that the SIP server is not blocking or filtering RTP packets',
                'Check firewall settings to ensure RTP ports are open (typically 10000-20000)'
            ]
        };
    } catch (error) {
        console.error('Error debugging audio tracks:', error);
        return { status: 'error', message: `Error: ${(error as Error).message}` };
    }
}

export function toggleVideo(enable: boolean) {
    if (!currentSession) return false;
    
    try {
        if (currentSession.sessionDescriptionHandler) {
            const pc = (currentSession.sessionDescriptionHandler as any).peerConnection;
            pc.getSenders().forEach((sender: RTCRtpSender) => {
                if (sender.track && sender.track.kind === 'video') {
                    sender.track.enabled = enable;
                }
            });
            return true;
        }
    } catch (error) {
        console.error("Error toggling video:", error);
    }
    return false;
}

export async function switchCamera() {
    if (!currentSession) return false;
    
    try {
        if (currentSession.sessionDescriptionHandler) {
            const pc = (currentSession.sessionDescriptionHandler as any).peerConnection;
            const videoSender = pc.getSenders().find((sender: RTCRtpSender) =>
                sender.track && sender.track.kind === 'video'
            );
            
            if (videoSender) {
                // Get current facingMode
                const currentTrack = videoSender.track;
                const currentFacingMode = currentTrack?.getSettings().facingMode;
                
                // Toggle between 'user' (front) and 'environment' (back)
                const newFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
                
                try {
                    const newStream = await navigator.mediaDevices.getUserMedia({
                        video: { facingMode: newFacingMode },
                        audio: false
                    });
                    
                    const newTrack = newStream.getVideoTracks()[0];
                    await videoSender.replaceTrack(newTrack);
                    
                    // Stop old track to release camera
                    if (currentTrack) {
                        currentTrack.stop();
                    }
                    
                    return true;
                } catch (error) {
                    console.error('Error switching camera:', error);
                    return false;
                }
            }
        }
    } catch (error) {
        console.error("Error accessing session for camera switch:", error);
    }
    return false;
}

/**
 * Test SIP connection with provided credentials
 * This function attempts to connect to the SIP server but doesn't persist the connection
 * It's used to validate credentials before saving them to the database
 */
export function testSIPConnection(config: SIPConfig): Promise<void> {
    return new Promise(async (resolve, reject) => {
        try {
            // Initialize SIP with the provided configuration
            await initSIP(config);
            
            // If we get here, the connection was successful
            console.log("✅ SIP connection test successful");
            
            // Unregister immediately to avoid keeping multiple connections open
            await unregisterSIP();
            
            // Resolve the promise to indicate success
            resolve();
        } catch (error) {
            console.error("❌ SIP connection test failed:", error);
            
            // Try to clean up if possible
            try {
                await unregisterSIP();
            } catch (cleanupError) {
                console.error("Error cleaning up after failed connection test:", cleanupError);
            }
            
            // Reject the promise to indicate failure
            reject(error);
        }
    });
}

export function unregisterSIP(): Promise<void> {
    return new Promise((resolve, reject) => {
        try {
            // Check if we have an active registration
            if (!registerer) {
                console.log("No active SIP registration to unregister");
                resolve();
                return;
            }
            
            console.log("Unregistering from SIP server...");
            
            // Set up a listener for the unregistered state
            const stateChangeListener = (state: string) => {
                if (state === "Unregistered") {
                    console.log("✅ Successfully unregistered from SIP server");
                    
                    // Clean up the listener to prevent memory leaks
                    registerer.stateChange.removeListener(stateChangeListener);
                    
                    // Clean up any active call
                    if (currentSession) {
                        try {
                            hangupCall();
                        } catch (error) {
                            console.error("Error hanging up call during unregistration:", error);
                        }
                    }
                    
                    // Clean up the user agent if it exists
                    if (ua) {
                        try {
                            ua.stop().then(() => {
                                console.log("✅ SIP User Agent stopped");
                                // Reset variables
                                registerer = null as unknown as Registerer;
                                ua = null as unknown as UserAgent;
                                currentSession = null as unknown as Session;
                                isOnHold = false;
                                
                                resolve();
                            }).catch(error => {
                                console.error("Error stopping SIP User Agent:", error);
                                reject(error);
                            });
                        } catch (error) {
                            console.error("Error stopping SIP User Agent:", error);
                            reject(error);
                        }
                    } else {
                        // If no user agent, just resolve
                        resolve();
                    }
                }
            };
            
            // Add the state change listener
            registerer.stateChange.addListener(stateChangeListener);
            
            // Unregister from the SIP server
            registerer.unregister()
                .catch(error => {
                    console.error("Error unregistering from SIP server:", error);
                    
                    // Clean up the listener
                    registerer.stateChange.removeListener(stateChangeListener);
                    
                    // Still try to clean up resources
                    if (ua) {
                        ua.stop().catch(e => console.error("Error stopping UA after failed unregister:", e));
                    }
                    
                    // Reset variables
                    registerer = null as unknown as Registerer;
                    ua = null as unknown as UserAgent;
                    currentSession = null as unknown as Session;
                    isOnHold = false;
                    
                    reject(error);
                });
        } catch (error) {
            console.error("Error in unregisterSIP:", error);
            reject(error);
        }
    });
}
