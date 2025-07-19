import {
    Invitation,
    Inviter,
    Messager,
    Registerer,
    Session,
    UserAgent,
    UserAgentOptions,
} from "sip.js";

let ua: UserAgent;
let registerer: Registerer;
let currentSession: Session;
let isOnHold: boolean = false;

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

export async function makeCall(target: string, withVideo = true): Promise<Session> {
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

        // If target doesn't have a domain, add the default domain
        if (!formattedTarget.includes('@')) {
            // Extract domain from the registered URI
            const registeredURI = ua.configuration.uri?.toString() || '';
            const domain = registeredURI.split('@')[1]?.split(';')[0] || 'jsmwebrtc.my.id';
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

export async function acceptCall(invitation: Invitation, withVideo = true): Promise<void> {
    try {
        // Request media permissions before accepting the call
        console.log(`Requesting media permissions for incoming call: audio=true, video=${withVideo}`);
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: withVideo
        });

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

        // Accept the invitation with the requested media constraints
        await invitation.accept({
            sessionDescriptionHandlerOptions: {
                constraints: {
                    audio: true,
                    video: withVideo,
                },
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
                // Extract domain from the registered URI
                const registeredURI = ua.configuration.uri?.toString() || '';
                const domain = registeredURI.split('@')[1]?.split(';')[0] || 'jsmwebrtc.my.id';
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
                // Extract domain from the registered URI
                const registeredURI = ua.configuration.uri?.toString() || '';
                const domain = registeredURI.split('@')[1]?.split(';')[0] || 'jsmwebrtc.my.id';
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
