import {
    Invitation,
    Inviter,
    Messager,
    Registerer,
    Session,
    UserAgent,
    UserAgentOptions,
} from "sip.js";
import { recordCallStart, recordCallEnd } from "./callRecorder";
import logger, { setSessionId } from "./logger";

// Export these variables so they can be accessed by other components
export let ua: UserAgent;
export let registerer: Registerer;
export let currentSession: Session;
export let isOnHold: boolean = false;

interface SIPConfig {
    uri: string;
    password: string;
    wsServer: string;
    onInvite?: (session: Invitation) => void;
    onMessage?: (message: string, from: string) => void;
    onRegistrationFailed?: (error: Error) => void;
    onRegistrationRetry?: (attempt: number, maxRetries: number, delay: number) => void;
    maxRetries?: number;
    retryDelay?: number;
    iceServers?: RTCIceServer[];
}

export function initSIP(config: SIPConfig): Promise<void> {
    logger.info("Initializing SIP client", { uri: config.uri, wsServer: config.wsServer }, "sipClient");
    
    return new Promise((resolve, reject) => {
        const {
            uri,
            password,
            wsServer,
            onInvite,
            onMessage,
            onRegistrationFailed,
            onRegistrationRetry,
            maxRetries = 0,
            retryDelay = 2000,
            iceServers
        } = config;

        let isPromiseSettled = false;
        let registrationTimeout: NodeJS.Timeout | null = null;
        let retryCount = 0;

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
                    // Set session ID for logging
                    setSessionId(invitation.id);
                    logger.info("Incoming call received", {
                        sessionId: invitation.id,
                        from: invitation.remoteIdentity?.uri?.toString() || "Unknown",
                        hasVideo: invitation.request?.body?.includes('m=video') || false
                    }, "sipClient");
                    
                    if (onInvite) {
                        onInvite(invitation);
                    }
                },
                onMessage: (message) => {
                    if (onMessage) {
                        const from = message.request.from.uri.toString();
                        const body = message.request.body;
                        logger.info("SIP message received", { from, bodyLength: body.length }, "sipClient");
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
                            logger.info("SIP connected and registered successfully", { uri }, "sipClient");
                            safeResolve();
                            break;
                        case "Unregistered":
                            logger.warn("SIP unregistered", { uri }, "sipClient");
                            if (!isPromiseSettled) {
                                if (retryCount < maxRetries) {
                                    retryCount++;
                                    logger.info(`Retrying SIP registration (${retryCount}/${maxRetries})...`,
                                        { uri, retryCount, maxRetries, retryDelay },
                                        "sipClient");
                                    
                                    // Call the retry callback if provided
                                    if (onRegistrationRetry) {
                                        onRegistrationRetry(retryCount, maxRetries, retryDelay);
                                    }
                                    
                                    // Attempt to register again after the specified delay
                                    setTimeout(() => {
                                        if (!isPromiseSettled && registerer) {
                                            logger.info(`Retry attempt ${retryCount}/${maxRetries}`,
                                                { uri, retryCount, maxRetries },
                                                "sipClient");
                                            registerer.register();
                                        }
                                    }, retryDelay);
                                } else {
                                    const error = new Error("Registration failed or expired.");
                                    logger.error("SIP registration failed or expired after maximum retries",
                                        { uri, maxRetries, error: error.message, stack: error.stack },
                                        "sipClient");
                                    safeReject(error);
                                }
                            }
                            break;
                        case "Terminated":
                            logger.warn("SIP registration terminated", { uri }, "sipClient");
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

/**
 * Makes an outgoing call to the specified target
 *
 * @param target The SIP address or phone number to call
 * @param withVideo Whether to include video in the call
 * @param userId Optional user ID for call recording. If provided, the call will be recorded in the call history
 * @returns A Promise that resolves to the SIP.js Session object
 */
export async function makeCall(target: string, withVideo = true, userId?: string): Promise<Session> {
    try {
        // Check if UserAgent is initialized
        if (!ua) {
            logger.warn("SIP User Agent not initialized. Attempting to initialize with stored credentials...",
                { target, withVideo }, "sipClient");
            
            // Check if we have stored SIP credentials
            const savedSipData = localStorage.getItem('sipData');
            
            if (!savedSipData) {
                const error = new Error("SIP User Agent not initialized and no stored credentials found. Please register first before making a call.");
                logger.error("Failed to make call - no SIP credentials", { target, error: error.message }, "sipClient");
                throw error;
            }
            
            try {
                // Parse the stored credentials
                const data = JSON.parse(savedSipData);
                
                if (!data.username || !data.password || !data.wsServer || !data.domain) {
                    const error = new Error("Incomplete SIP credentials found. Please register with complete information before making a call.");
                    logger.error("Failed to make call - incomplete SIP credentials",
                        {
                            target,
                            hasUsername: !!data.username,
                            hasPassword: !!data.password,
                            hasWsServer: !!data.wsServer,
                            hasDomain: !!data.domain
                        },
                        "sipClient");
                    throw error;
                }
                
                logger.info("Initializing SIP User Agent with stored credentials...",
                    { username: data.username, domain: data.domain, wsServer: data.wsServer },
                    "sipClient");
                
                // Construct SIP URI from username and domain
                const sipUri = `sip:${data.username}@${data.domain}`;
                
                // Initialize SIP client with stored credentials
                await initSIP({
                    uri: sipUri,
                    password: data.password,
                    wsServer: data.wsServer,
                    iceServers: [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:stun1.l.google.com:19302' },
                        { urls: 'stun:stun2.l.google.com:19302' }
                    ]
                });
                
                logger.info("SIP User Agent initialized successfully with stored credentials",
                    { username: data.username, domain: data.domain },
                    "sipClient");
            } catch (error) {
                logger.error("Failed to initialize SIP User Agent with stored credentials",
                    { target, error: error instanceof Error ? error.message : String(error) },
                    "sipClient");
                throw new Error("Failed to initialize SIP User Agent with stored credentials. Please register again before making a call.");
            }
            
            // Check if UserAgent is now initialized
            if (!ua) {
                const error = new Error("SIP User Agent initialization failed. Please register manually before making a call.");
                logger.error("SIP User Agent initialization failed", { target }, "sipClient");
                throw error;
            }
        }
        
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

        // If target doesn't have a domain, add the default domain
        if (!formattedTarget.includes('@')) {
            // Extract domain from the registered URI if available, otherwise use default
            let domain = 'jsmwebrtc.my.id';
            if (ua && ua.configuration && ua.configuration.uri) {
                const registeredURI = ua.configuration.uri.toString() || '';
                domain = registeredURI.split('@')[1]?.split(';')[0] || domain;
            }
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

        const inviter = new Inviter(ua, targetURI, {
            sessionDescriptionHandlerOptions: {
                constraints: {
                    audio: true,
                    video: withVideo,
                },
            },
        });

        currentSession = inviter;
        
        // Set session ID for logging
        setSessionId(inviter.id);
        
        logger.info("Outgoing call created", {
            sessionId: inviter.id,
            target: formattedTarget,
            withVideo
        }, "sipClient");

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

        // Add state change listener to debug audio issues and record call events
        inviter.stateChange.addListener((state) => {
            console.log(`Call state changed to: ${state}`);

            // When call is established, check audio tracks and connection
            if (state === 'Established') {
                console.log('Call established, checking audio tracks and connection...');
                
                // Record call start if userId is provided
                if (userId) {
                    console.log(`Recording outgoing call start for user: ${userId}`);
                    recordCallStart(userId, inviter, 'outgoing')
                        .then(recordEndFn => {
                            // Store the function to record call end
                            (inviter as any)._recordCallEnd = recordEndFn;
                        })
                        .catch(error => {
                            console.error('Error recording call start:', error);
                        });
                }

                if (inviter.sessionDescriptionHandler) {
                    const sessionDescriptionHandler = inviter.sessionDescriptionHandler as any;
                    if (sessionDescriptionHandler.peerConnection) {
                        const pc = sessionDescriptionHandler.peerConnection;

                        // Log RTCPeerConnection state
                        console.log(`RTCPeerConnection state: ${pc.connectionState}`);
                        console.log(`ICE connection state: ${pc.iceConnectionState}`);
                        console.log(`Signaling state: ${pc.signalingState}`);
                        
                        // Add listener for ICE connection state changes
                        pc.addEventListener('iceconnectionstatechange', () => {
                            console.log(`Outgoing call: ICE connection state changed to: ${pc.iceConnectionState}`);
                            
                            switch (pc.iceConnectionState) {
                                case 'checking':
                                    console.log('⏳ Outgoing call: ICE is checking connections...');
                                    break;
                                case 'connected':
                                    console.log('✅ Outgoing call: ICE connection established successfully');
                                    break;
                                case 'completed':
                                    console.log('✅ Outgoing call: ICE connection completed, all candidates gathered');
                                    break;
                                case 'failed':
                                    console.error('❌ Outgoing call: ICE connection failed - could not find a valid connection');
                                    // Try to gracefully terminate the call
                                    try {
                                        console.log('Attempting to terminate outgoing call after ICE failure');
                                        if (inviter.state === 'Established') {
                                            inviter.bye();
                                        } else {
                                            inviter.cancel();
                                        }
                                    } catch (error) {
                                        console.error("Error terminating outgoing call after ICE failure:", error);
                                    }
                                    break;
                                case 'disconnected':
                                    console.warn('⚠️ Outgoing call: ICE connection disconnected - may recover automatically');
                                    break;
                                case 'closed':
                                    console.log('Outgoing call: ICE connection closed');
                                    break;
                            }
                        });

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

/**
 * Accepts an incoming call
 *
 * @param invitation The SIP.js Invitation object representing the incoming call
 * @param withVideo Whether to include video in the call
 * @param userId Optional user ID for call recording. If provided, the call will be recorded in the call history
 * @returns A Promise that resolves when the call is confirmed (fully established)
 */
export async function acceptCall(invitation: Invitation, withVideo = true, userId?: string): Promise<void> {
    try {
        // Set session ID for logging if not already set
        setSessionId(invitation.id);
        
        // Request media permissions before accepting the call
        logger.info(`Requesting media permissions for incoming call`,
            { sessionId: invitation.id, withVideo, from: invitation.remoteIdentity?.uri?.toString() || "Unknown" },
            "sipClient");
        
        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: withVideo
            });
            logger.info(`Local stream created successfully`,
                { sessionId: invitation.id, audioTracks: stream.getAudioTracks().length, videoTracks: stream.getVideoTracks().length },
                "sipClient");
        } catch (mediaError) {
            logger.error(`Failed to create local stream`,
                { sessionId: invitation.id, error: mediaError instanceof Error ? mediaError.message : String(mediaError) },
                "sipClient");
            throw mediaError;
        }

        // Create a promise that will resolve when the call is confirmed or established
        return new Promise((resolve, reject) => {
            // Flag to track if the promise has been resolved or rejected
            let isPromiseSettled = false;
            
            // Set a timeout to reject the promise if the call isn't confirmed within a reasonable time
            const confirmationTimeout = setTimeout(() => {
                if (!isPromiseSettled) {
                    isPromiseSettled = true;
                    logger.error(`Call confirmation timed out`, { sessionId: invitation.id }, "sipClient");
                    reject(new Error("Call confirmation timed out after 60 seconds"));
                }
            }, 60000); // Increased from 30 to 60 seconds

            // Add state change listener to handle call state changes
            const stateChangeListener = (state: string) => {
                logger.info(`Incoming call state changed`,
                    { sessionId: invitation.id, state, from: invitation.remoteIdentity?.uri?.toString() || "Unknown" },
                    "sipClient");

                // Handle different call states
                if (state === 'Accepted') {
                    logger.info('Call accepted, waiting for confirmation or establishment...',
                        { sessionId: invitation.id }, "sipClient");
                    // This is an early state, we don't resolve the promise yet
                } else if (state === 'Confirmed') {
                    logger.info('Call confirmed! Call is now fully established.',
                        { sessionId: invitation.id }, "sipClient");
                    
                    // Only proceed if the promise hasn't been settled yet
                    if (!isPromiseSettled) {
                        isPromiseSettled = true;
                        
                        // Clear the timeout since we've confirmed the call
                        clearTimeout(confirmationTimeout);
                        
                        // Record call start if userId is provided - only after confirmation
                        if (userId) {
                            logger.info(`Recording incoming call start for user`,
                                { sessionId: invitation.id, userId }, "sipClient");
                            recordCallStart(userId, invitation, 'incoming')
                                .then(recordEndFn => {
                                    // Store the function to record call end
                                    (invitation as any)._recordCallEnd = recordEndFn;
                                    logger.debug('Call recording function stored',
                                        { sessionId: invitation.id, userId }, "sipClient");
                                })
                                .catch(error => {
                                    logger.error('Error recording incoming call start',
                                        { sessionId: invitation.id, userId, error: error instanceof Error ? error.message : String(error) },
                                        "sipClient");
                                });
                        }
                        
                        // Resolve the promise to indicate the call is fully established
                        resolve();
                    }
                } else if (state === 'Terminated') {
                    logger.warn('Call terminated before it was confirmed or established',
                        { sessionId: invitation.id }, "sipClient");
                    
                    // Only proceed if the promise hasn't been settled yet
                    if (!isPromiseSettled) {
                        isPromiseSettled = true;
                        
                        // Clear the timeout since the call was terminated
                        clearTimeout(confirmationTimeout);
                        
                        // Reject the promise with an error
                        const error = new Error("Call was terminated before it could be confirmed or established");
                        logger.error('Call acceptance failed',
                            { sessionId: invitation.id, error: error.message }, "sipClient");
                        reject(error);
                    }
                    
                    // Remove the listener to prevent memory leaks
                    invitation.stateChange.removeListener(stateChangeListener);
                } else if (state === 'Established') {
                    logger.info('Incoming call established! This state can also be used to consider the call as active.',
                        { sessionId: invitation.id }, "sipClient");
                    
                    // Only proceed if the promise hasn't been settled yet
                    if (!isPromiseSettled) {
                        isPromiseSettled = true;
                        
                        // Clear the timeout since we've established the call
                        clearTimeout(confirmationTimeout);
                        
                        // Record call start if userId is provided - after establishment
                        if (userId) {
                            logger.info(`Recording incoming call start for user`,
                                { sessionId: invitation.id, userId }, "sipClient");
                            recordCallStart(userId, invitation, 'incoming')
                                .then(recordEndFn => {
                                    // Store the function to record call end
                                    (invitation as any)._recordCallEnd = recordEndFn;
                                    logger.debug('Call recording function stored',
                                        { sessionId: invitation.id, userId }, "sipClient");
                                })
                                .catch(error => {
                                    logger.error('Error recording incoming call start',
                                        { sessionId: invitation.id, userId, error: error instanceof Error ? error.message : String(error) },
                                        "sipClient");
                                });
                        }
                        
                        // Resolve the promise to indicate the call is established
                        logger.debug('Resolving promise based on Established state',
                            { sessionId: invitation.id }, "sipClient");
                        resolve();
                    }
                    
                    // Continue with audio track checks
                    console.log('Checking audio tracks and connection...');
                    
                    if (invitation.sessionDescriptionHandler) {
                        const sessionDescriptionHandler = invitation.sessionDescriptionHandler as any;
                        if (sessionDescriptionHandler.peerConnection) {
                            const pc = sessionDescriptionHandler.peerConnection;

                            // Log RTCPeerConnection state
                            console.log(`RTCPeerConnection state: ${pc.connectionState}`);
                            console.log(`ICE connection state: ${pc.iceConnectionState}`);
                            console.log(`Signaling state: ${pc.signalingState}`);
                            
                            // Add listener for ICE connection state changes
                            pc.addEventListener('iceconnectionstatechange', () => {
                                console.log(`ICE connection state changed to: ${pc.iceConnectionState}`);
                                
                                switch (pc.iceConnectionState) {
                                    case 'checking':
                                        console.log('⏳ ICE is checking connections...');
                                        break;
                                    case 'connected':
                                        console.log('✅ ICE connection established successfully');
                                        break;
                                    case 'completed':
                                        console.log('✅ ICE connection completed, all candidates gathered');
                                        break;
                                    case 'failed':
                                        console.error('❌ ICE connection failed - could not find a valid connection');
                                        // If the promise hasn't been settled yet, reject it
                                        if (!isPromiseSettled) {
                                            isPromiseSettled = true;
                                            clearTimeout(confirmationTimeout);
                                            reject(new Error("ICE connection failed - could not establish a connection"));
                                            
                                            // Try to gracefully terminate the call
                                            try {
                                                invitation.bye();
                                            } catch (error) {
                                                console.error("Error terminating call after ICE failure:", error);
                                            }
                                        }
                                        break;
                                    case 'disconnected':
                                        console.warn('⚠️ ICE connection disconnected - may recover automatically');
                                        break;
                                    case 'closed':
                                        console.log('ICE connection closed');
                                        break;
                                }
                            });

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
            };

            // Add the state change listener
            invitation.stateChange.addListener(stateChangeListener);

            // Try to add tracks immediately if sessionDescriptionHandler is available
            const addTracksToConnection = (session: any, mediaStream: MediaStream) => {
                logger.info(`Attempting to add tracks to connection`,
                    { sessionId: invitation.id, state: session.state },
                    "sipClient");
                
                if (!mediaStream) {
                    logger.error(`Cannot add tracks: Media stream is null or undefined`,
                        { sessionId: invitation.id },
                        "sipClient");
                    return false;
                }
                
                if (!session.sessionDescriptionHandler) {
                    logger.error(`No sessionDescriptionHandler available yet for incoming call`,
                        { sessionId: invitation.id },
                        "sipClient");
                    return false;
                }
                
                const sessionDescriptionHandler = session.sessionDescriptionHandler as any;
                if (!sessionDescriptionHandler.peerConnection) {
                    logger.error(`No peerConnection found in sessionDescriptionHandler for incoming call`,
                        { sessionId: invitation.id },
                        "sipClient");
                    return false;
                }
                
                const pc = sessionDescriptionHandler.peerConnection;
                
                // Log connection state
                logger.info(`RTCPeerConnection state before adding tracks`,
                    {
                        sessionId: invitation.id,
                        connectionState: pc.connectionState,
                        iceConnectionState: pc.iceConnectionState,
                        signalingState: pc.signalingState
                    },
                    "sipClient");

                // Check if we already have senders with tracks
                const existingSenders = pc.getSenders();
                const audioSenders = existingSenders.filter((sender: RTCRtpSender) =>
                    sender.track && sender.track.kind === 'audio');
                const hasEnabledAudioSender = audioSenders.some((sender: RTCRtpSender) =>
                    sender.track && sender.track.enabled);

                logger.info(`Existing senders check`,
                    {
                        sessionId: invitation.id,
                        totalSenders: existingSenders.length,
                        audioSenders: audioSenders.length,
                        hasEnabledAudioSender: hasEnabledAudioSender
                    },
                    "sipClient");

                if (!hasEnabledAudioSender) {
                    logger.info(`No active audio senders found, adding tracks to connection for incoming call`,
                        { sessionId: invitation.id },
                        "sipClient");

                    try {
                        // Add tracks from the stream
                        const audioTracks = mediaStream.getAudioTracks();
                        const videoTracks = mediaStream.getVideoTracks();
                        
                        logger.info(`Available tracks in media stream`,
                            {
                                sessionId: invitation.id,
                                audioTracks: audioTracks.length,
                                videoTracks: videoTracks.length
                            },
                            "sipClient");
                        
                        // Add each track and log the result
                        mediaStream.getTracks().forEach(track => {
                            try {
                                logger.info(`Adding ${track.kind} track to peer connection`,
                                    {
                                        sessionId: invitation.id,
                                        trackId: track.id,
                                        trackEnabled: track.enabled,
                                        trackMuted: track.muted
                                    },
                                    "sipClient");
                                pc.addTrack(track, mediaStream);
                            } catch (trackError) {
                                logger.error(`Failed to add ${track.kind} track to peer connection`,
                                    {
                                        sessionId: invitation.id,
                                        trackId: track.id,
                                        error: trackError instanceof Error ? trackError.message : String(trackError)
                                    },
                                    "sipClient");
                            }
                        });
                        
                        // Verify tracks were added
                        const updatedSenders = pc.getSenders();
                        logger.info(`Tracks added to connection`,
                            {
                                sessionId: invitation.id,
                                sendersBefore: existingSenders.length,
                                sendersAfter: updatedSenders.length
                            },
                            "sipClient");
                            
                        return true;
                    } catch (error) {
                        logger.error(`Error adding tracks to connection`,
                            {
                                sessionId: invitation.id,
                                error: error instanceof Error ? error.message : String(error)
                            },
                            "sipClient");
                        return false;
                    }
                } else {
                    logger.info(`Active audio senders already exist for incoming call`,
                        { sessionId: invitation.id, audioSenders: audioSenders.length },
                        "sipClient");
                    return false;
                }
            };

            // Add state change listener to add tracks when sessionDescriptionHandler is available
            invitation.stateChange.addListener((newState) => {
                logger.info(`Incoming call state changed to ${newState}`,
                    { sessionId: invitation.id, state: newState },
                    "sipClient");
                
                // Try to add tracks at various states to ensure they're added
                if (newState === 'Establishing' || newState === 'Established' || newState === 'Accepted') {
                    logger.info(`Call in ${newState} state, attempting to add tracks...`,
                        { sessionId: invitation.id },
                        "sipClient");
                    
                    // Check if the peer connection exists and is in a good state before adding tracks
                    if (invitation.sessionDescriptionHandler) {
                        const sessionDescriptionHandler = invitation.sessionDescriptionHandler as any;
                        if (sessionDescriptionHandler.peerConnection) {
                            const pc = sessionDescriptionHandler.peerConnection;
                            
                            logger.info(`PeerConnection state check before adding tracks`,
                                {
                                    sessionId: invitation.id,
                                    connectionState: pc.connectionState,
                                    iceConnectionState: pc.iceConnectionState,
                                    signalingState: pc.signalingState
                                },
                                "sipClient");
                            
                            // Only add tracks if the connection is in a good state
                            if (pc.signalingState !== 'closed') {
                                addTracksToConnection(invitation, stream);
                            } else {
                                logger.warn(`Not adding tracks: PeerConnection is in ${pc.signalingState} state`,
                                    { sessionId: invitation.id },
                                    "sipClient");
                            }
                        } else {
                            logger.warn(`Not adding tracks: No PeerConnection available`,
                                { sessionId: invitation.id },
                                "sipClient");
                        }
                    } else {
                        logger.warn(`Not adding tracks: No SessionDescriptionHandler available`,
                            { sessionId: invitation.id },
                            "sipClient");
                    }
                }
            });

            // Accept the invitation with the requested media constraints
            invitation.accept({
                sessionDescriptionHandlerOptions: {
                    constraints: {
                        audio: true,
                        video: withVideo,
                    },
                },
            }).then(() => {
                logger.info('Call accepted, setting up track addition attempts',
                    { sessionId: invitation.id },
                    "sipClient");
                
                // Try to add tracks immediately after accepting the call
                let trackAddAttempts = 0;
                const maxTrackAddAttempts = 5;
                const attemptTrackAdd = () => {
                    if (isPromiseSettled) {
                        logger.info('Promise already settled, not attempting to add tracks',
                            { sessionId: invitation.id },
                            "sipClient");
                        return;
                    }
                    
                    trackAddAttempts++;
                    logger.info(`Attempting to add tracks (attempt ${trackAddAttempts}/${maxTrackAddAttempts})`,
                        { sessionId: invitation.id },
                        "sipClient");
                    
                    const added = addTracksToConnection(invitation, stream);
                    
                    // If tracks weren't added and we haven't reached max attempts, try again
                    if (!added && trackAddAttempts < maxTrackAddAttempts) {
                        const delay = 500 * Math.pow(2, trackAddAttempts - 1); // Exponential backoff: 500ms, 1s, 2s, 4s
                        logger.info(`Scheduling next track addition attempt in ${delay}ms`,
                            { sessionId: invitation.id, nextAttempt: trackAddAttempts + 1 },
                            "sipClient");
                        setTimeout(attemptTrackAdd, delay);
                    } else if (added) {
                        logger.info(`Successfully added tracks on attempt ${trackAddAttempts}`,
                            { sessionId: invitation.id },
                            "sipClient");
                    } else {
                        logger.warn(`Failed to add tracks after ${maxTrackAddAttempts} attempts`,
                            { sessionId: invitation.id },
                            "sipClient");
                    }
                };
                
                // Start the first attempt after a short delay
                setTimeout(attemptTrackAdd, 100);
                
            }).catch(error => {
                logger.error("Error accepting call",
                    {
                        sessionId: invitation.id,
                        error: error instanceof Error ? error.message : String(error)
                    },
                    "sipClient");
                clearTimeout(confirmationTimeout);
                reject(error);
                
                // Remove the listener to prevent memory leaks
                invitation.stateChange.removeListener(stateChangeListener);
            });

            // Store the current session
            currentSession = invitation;
        });
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

/**
 * Ends the current call
 *
 * If the call was being recorded (via recordCallStart), this function will also
 * record the end of the call in the call history by calling the _recordCallEnd function
 * that was stored on the session object.
 */
export function hangupCall() {
    if (currentSession) {
        // Store a reference to the current session
        const session = currentSession;
        const sessionId = session.id;
        
        logger.info(`Hanging up call`, { sessionId, state: session.state }, "sipClient");

        // Handle different session states
        if (session.state === "Established" || session.state === "Accepted" || session.state === "Confirmed") {
            // For established or accepted calls, use bye()
            logger.info(`Call in ${session.state} state, using bye() to terminate`, { sessionId }, "sipClient");
            session.bye();
        } else if (session.state === "Initial") {
            // For initial state, use cancel() for outgoing calls or reject() for incoming calls
            if (session instanceof Inviter) {
                logger.info('Outgoing call in Initial state, using cancel() to terminate', { sessionId }, "sipClient");
                session.cancel();
            } else if (session instanceof Invitation) {
                logger.info('Incoming call in Initial state, using reject() to terminate', { sessionId }, "sipClient");
                session.reject();
            } else {
                logger.warn('Unknown session type in Initial state, attempting to terminate', { sessionId }, "sipClient");
                try {
                    // Try to use bye() as a fallback
                    session.bye();
                } catch (error) {
                    logger.error('Error terminating unknown session type',
                        { sessionId, error: error instanceof Error ? error.message : String(error) },
                        "sipClient");
                }
            }
        } else {
            // For any other state, handle based on session type
            if (session instanceof Inviter) {
                // For outgoing calls in early states, use cancel() unless already terminated
                if (session.state === "Terminated") {
                    // If the session is already terminated, just log it and don't try to terminate again
                    logger.info(`Outgoing call already in Terminated state, no action needed`, { sessionId }, "sipClient");
                } else {
                    logger.info(`Outgoing call in ${session.state} state, using cancel() to terminate`, { sessionId }, "sipClient");
                    try {
                        session.cancel();
                    } catch (error) {
                        logger.error(`Error canceling outgoing call`,
                            { sessionId, state: session.state, error: error instanceof Error ? error.message : String(error) },
                            "sipClient");
                    }
                }
            } else if (session instanceof Invitation) {
                // For incoming calls, try to reject unless already terminated
                if (session.state === "Terminated") {
                    // If the session is already terminated, just log it and don't try to terminate again
                    logger.info(`Incoming call already in Terminated state, no action needed`, { sessionId }, "sipClient");
                } else {
                    logger.info(`Incoming call in ${session.state} state, using reject() to terminate`, { sessionId }, "sipClient");
                    try {
                        session.reject();
                    } catch (rejectError) {
                        logger.error('Error rejecting call',
                            { sessionId, error: rejectError instanceof Error ? rejectError.message : String(rejectError) },
                            "sipClient");
                    }
                }
            } else {
                // For unknown session types, try bye() as a last resort unless already terminated
                if (session.state === "Terminated") {
                    // If the session is already terminated, just log it and don't try to terminate again
                    logger.info(`Call already in Terminated state, no action needed`, { sessionId }, "sipClient");
                } else {
                    logger.info(`Call in ${session.state} state, attempting to terminate with bye() as last resort`, { sessionId }, "sipClient");
                    try {
                        session.bye();
                    } catch (error) {
                        logger.error(`Error terminating call with bye()`,
                            { sessionId, state: session.state, error: error instanceof Error ? error.message : String(error) },
                            "sipClient");
                    }
                }
            }
        }

        // Record call end if the function exists
        if ((session as any)._recordCallEnd && typeof (session as any)._recordCallEnd === 'function') {
            logger.info('Recording call end', { sessionId }, "sipClient");
            try {
                (session as any)._recordCallEnd().catch((error: any) => {
                    logger.error('Error recording call end',
                        { sessionId, error: error instanceof Error ? error.message : String(error) },
                        "sipClient");
                });
            } catch (error) {
                logger.error('Error calling record call end function',
                    { sessionId, error: error instanceof Error ? error.message : String(error) },
                    "sipClient");
            }
        }

        // Add a one-time listener to handle final cleanup after termination
        const stateChangeListener = (state: string) => {
            if (state === "Terminated") {
                logger.info("Session terminated and cleaned up", { sessionId }, "sipClient");
                // Remove the listener to prevent memory leaks
                session.stateChange.removeListener(stateChangeListener);
            }
        };
        
        session.stateChange.addListener(stateChangeListener);
        
        // Clean up the session reference after setting up the listener
        // This ensures we don't lose the reference before the listener is added
        logger.debug('Clearing current session reference', { sessionId }, "sipClient");
        currentSession = null as unknown as Session;
        
        // Clear the session ID from logging context
        setSessionId(null);
    } else {
        logger.info('No active call to hang up', {}, "sipClient");
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
    return new Promise((resolve, reject) => {
        try {
            console.log(`Sending message to ${target}: ${message}`);

            // Check if UA is initialized
            if (!ua) {
                const error = new Error("SIP User Agent not initialized. Please register first.");
                console.error(error);
                return reject(error);
            }

            // Ensure target has the correct format
            let formattedTarget = target;

            // If target doesn't have a scheme (sip:), add it
            if (!formattedTarget.startsWith('sip:') && !formattedTarget.startsWith('sips:')) {
                formattedTarget = `sip:${formattedTarget}`;
            }

            // If target doesn't have a domain, add the default domain
            if (!formattedTarget.includes('@')) {
                // Extract domain from the registered URI if available, otherwise use default
                let domain = 'jsmwebrtc.my.id';
                if (ua && ua.configuration && ua.configuration.uri) {
                    const registeredURI = ua.configuration.uri.toString() || '';
                    domain = registeredURI.split('@')[1]?.split(';')[0] || domain;
                }
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

export function transferCall(target: string) {
    if (!currentSession) return false;
    
    // Check if UserAgent is initialized
    if (!ua) {
        console.error("SIP User Agent not initialized. Please register first before transferring a call.");
        return false;
    }

    try {
        if (currentSession instanceof Inviter) {
            // Ensure target has the correct format
            let formattedTarget = target;

            // If target doesn't have a scheme (sip:), add it
            if (!formattedTarget.startsWith('sip:') && !formattedTarget.startsWith('sips:')) {
                formattedTarget = `sip:${formattedTarget}`;
            }

            // If target doesn't have a domain, add the default domain
            if (!formattedTarget.includes('@')) {
                // Extract domain from the registered URI if available, otherwise use default
                let domain = 'jsmwebrtc.my.id';
                if (ua && ua.configuration && ua.configuration.uri) {
                    const registeredURI = ua.configuration.uri.toString() || '';
                    domain = registeredURI.split('@')[1]?.split(';')[0] || domain;
                }
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
 * Unregisters from the SIP server and cleans up resources
 *
 * @returns A Promise that resolves when unregistration is complete
 */
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
