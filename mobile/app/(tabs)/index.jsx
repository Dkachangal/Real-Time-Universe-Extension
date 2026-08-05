import { Platform, StyleSheet, Text, TouchableOpacity, View, Animated, Easing } from 'react-native'
import React, { useState, useRef, useEffect } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as Location from 'expo-location'
import * as TaskManager from 'expo-task-manager'
import { DeviceMotion } from 'expo-sensors'
import { io } from 'socket.io-client'

// SOCKET.IO CLIENT SETUP 
const IP_ADD = '172.19.73.114';
const SERVER_URL = `http://${IP_ADD}:3000`; 
const socket = io(SERVER_URL, {
  autoConnect: true,
});
// on connection
socket.on('connect', () => {
  console.log(' MOBILE SOCKET CONNECTED');
});

socket.on('connect_error', (error) => {
  console.log('MOBILE socket could not connect -> error', error.message);
});


TaskManager.defineTask('fetchLocationBG', ({ data, error }) => {
  if (error) {
    console.log("Error in background worker:", error);
    return;
  }
  if (data && data.locations && data.locations.length > 0) {
    console.log("Background Coords:", data.locations[0].coords.latitude, data.locations[0].coords.longitude);
  }
});

const getCompassDirection = (degrees) => {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(degrees / 45) % 8;
  return directions[index];
};

const Index = () => { 
  const [status, requestPermission] = Location.useForegroundPermissions();
  const [bgStatus, requestBgPermission] = Location.useBackgroundPermissions();

  const [isTracking, setIsTracking] = useState(false);
  
  const [fgSubscription, setFgSubscription] = useState(null);
  const [compassSubscription, setCompassSubscription] = useState(null);

  const telemetryRef = useRef({
    latitude: 0,
    longitude: 0,
    heading: 0,
    compassDir: 'N',
    yaw: 0,
    pitch: 0,
    roll: 0,
  });
  
  const [telemetry, setTelemetry] = useState(telemetryRef.current);

  const updateTelemetry = (newData) => {
    telemetryRef.current = { ...telemetryRef.current, ...newData };
    setTelemetry(telemetryRef.current); 
    
    if (socket.connected) {
      socket.emit('mobile_data_stream', telemetryRef.current); 
    }
  };

  const animatedHeading = useRef(new Animated.Value(0)).current;
  const animatedGyroX = useRef(new Animated.Value(0)).current;
  const animatedGyroY = useRef(new Animated.Value(0)).current;
  
  const continuousHeading = useRef(0);
  const lastHeading = useRef(null);

  useEffect(() => {
    return () => {
      socket.disconnect();
    };
  }, []);

  // basically if yes, then no, and otherwise...its working 😭✌️
  const handleLocationToggle = async () => {
    if (!status?.granted) {
      await requestPermission();
      return;
    }
    if (!bgStatus?.granted) {
      await requestBgPermission();
      return;
    }

    if (isTracking) {
      await Location.stopLocationUpdatesAsync('fetchLocationBG');
      if (fgSubscription) fgSubscription.remove();
      if (compassSubscription) compassSubscription.remove();
      setFgSubscription(null);
      setCompassSubscription(null);
      DeviceMotion.removeAllListeners();

      Animated.parallel([
        Animated.timing(animatedHeading, { toValue: 0, duration: 400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(animatedGyroX, { toValue: 0, duration: 400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(animatedGyroY, { toValue: 0, duration: 400, easing: Easing.out(Easing.quad), useNativeDriver: true })
      ]).start();

      setIsTracking(false);
      
      continuousHeading.current = 0;
      lastHeading.current = null;
      
      updateTelemetry({
        latitude: 0, longitude: 0, heading: 0, compassDir: 'N', yaw: 0, pitch: 0, roll: 0
      });
      return;
    }

    console.log("Initializing Smooth Fluid Telemetry Core...");

    DeviceMotion.setUpdateInterval(16);
    DeviceMotion.addListener((motionEvent) => {
      if (motionEvent.rotation) {
        Animated.timing(animatedGyroX, { toValue: motionEvent.rotation.gamma * 45, duration: 32, easing: Easing.linear, useNativeDriver: true }).start();
        Animated.timing(animatedGyroY, { toValue: motionEvent.rotation.beta * 45, duration: 32, easing: Easing.linear, useNativeDriver: true }).start();

        updateTelemetry({
          yaw: motionEvent.rotation.gamma,
          pitch: motionEvent.rotation.beta,
          roll: motionEvent.rotation.alpha
        });
      }
    });

    const activeCompassWatcher = await Location.watchHeadingAsync((headingData) => {
      const rawHeading = headingData.trueHeading >= 0 ? headingData.trueHeading : headingData.magneticHeading;
      
      if (lastHeading.current === null) {
        lastHeading.current = rawHeading;
      } else {
        let filterDelta = rawHeading - lastHeading.current;
        if (filterDelta > 180) filterDelta -= 360;
        if (filterDelta < -180) filterDelta += 360;
        // 0.15 keep this number AS IT IS. varna fielding set compass ki
        lastHeading.current = (lastHeading.current + (filterDelta * 0.15) + 360) % 360; 
      }
      
      const currentHeading = lastHeading.current;
      
      // prevents it from zada ulta sidha ghumna, cause when the compass goes from 
      // 359 to 1 deg, normally it goes back around 358 degrees, but now
      // i rotate it opposite
      let delta = currentHeading - (continuousHeading.current % 360);
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      
      continuousHeading.current += delta;
      
      // stability me sudhaar 🦒
      Animated.spring(animatedHeading, { 
        toValue: continuousHeading.current, 
        friction: 6,
        tension: 40,
        useNativeDriver: true 
      }).start();

      updateTelemetry({
        heading: currentHeading,
        compassDir: getCompassDirection(currentHeading)
      });
    });
    setCompassSubscription(activeCompassWatcher);

    await Location.startLocationUpdatesAsync('fetchLocationBG', {
      accuracy: Location.LocationAccuracy.BestForNavigation,
      distanceInterval: 10,
      foregroundService: {
        notificationTitle: "Telemetry Core Operational",
        notificationBody: "Monitoring continuous physical orientation matrices."
      }
    });

    const activeScreenWatcher = await Location.watchPositionAsync(
      { accuracy: Location.LocationAccuracy.BestForNavigation, distanceInterval: 10 },
      (delivery) => { 
        updateTelemetry({
          latitude: delivery.coords.latitude,
          longitude: delivery.coords.longitude
        });
      }
    );

    setFgSubscription(activeScreenWatcher);
    setIsTracking(true);
  }

  const spinCompassAngle = animatedHeading.interpolate({
    inputRange: [0, 360],
    outputRange: ['0deg', '-360deg']
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.brandTitle}>AXIS</Text>
        <View style={[styles.statusBadge, { backgroundColor: isTracking ? '#00ff66' : '#221e3b' }]}>
          <Text style={[styles.statusText, { color: isTracking ? '#000000' : '#8e8ca8' }]}>
            {isTracking ? "LIVE" : "STDBY"}
          </Text>
        </View>
      </View>

      <View style={styles.radarCard}>
        <View style={styles.instrumentRim}>
          <Animated.View style={[styles.compassDial, { transform: [{ rotate: spinCompassAngle }] }]}>
            <Text style={[styles.dialTag, { top: 10, color: '#ff3355', fontWeight: 'bold' }]}>N</Text>
            <Text style={[styles.dialTag, { right: 12, top: '46%' }]}>E</Text>
            <Text style={[styles.dialTag, { bottom: 10 }]}>S</Text>
            <Text style={[styles.dialTag, { left: 12, top: '46%' }]}>W</Text>
          </Animated.View>
          <Animated.View style={[
            styles.gyroReticle, 
            { transform: [{ translateX: animatedGyroX }, { translateY: animatedGyroY }] }
          ]}>
            <View style={styles.centerDot} />
            <View style={styles.laserX} />
            <View style={styles.laserY} />
          </Animated.View>
          <View style={styles.deadzoneRing} />
        </View>
      </View>

      <View style={styles.hudWrapper}>
        <View style={styles.hudCard}>
          <Text style={styles.hudLabel}>VECTORS</Text>
          <Text style={styles.hudValue}>{telemetry.latitude.toFixed(5)}</Text>
          <Text style={styles.hudSubtext}>LATITUDE</Text>
          <Text style={[styles.hudValue, { marginTop: 12 }]}>{telemetry.longitude.toFixed(5)}</Text>
          <Text style={styles.hudSubtext}>LONGITUDE</Text>
        </View>

        <View style={styles.hudCard}>
          <Text style={styles.hudLabel}>TRAJECTORY</Text>
          <Text style={styles.hudValue}>{telemetry.compassDir} <Text style={styles.degreeUnit}>{telemetry.heading.toFixed(0)}°</Text></Text>
          <Text style={styles.hudSubtext}>HEADING BEARING</Text>
          <Text style={[styles.hudValue, { marginTop: 12 }]}>{(telemetry.pitch * 57.29).toFixed(1)}°</Text>
          <Text style={styles.hudSubtext}>PITCH ANGULATION</Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.actionButton, { backgroundColor: isTracking ? '#ff3355' : '#ffffff' }]}
        onPress={handleLocationToggle}
        activeOpacity={0.9}
      >
        <Text style={[styles.actionText, { color: isTracking ? '#ffffff' : '#0a0915' }]}>
          {isTracking ? "DISCONNECT NODE" : "ENGAGE SYSTEMS"}
        </Text>
      </TouchableOpacity>
    </SafeAreaView>
  )
}

export default Index 

// STYLESHEET FINAL AI IMPROVEMENTS TO ENHANCE LOOK...can improve baad me when to add more features

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0915', paddingHorizontal: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 15 },
  brandTitle: { fontSize: 22, color: '#ffffff', fontWeight: '800', letterSpacing: 5 },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 6 },
  statusText: { fontSize: 11, fontWeight: '900', letterSpacing: 1.5 },
  radarCard: { flex: 1.2, backgroundColor: '#121124', borderRadius: 28, marginVertical: 20, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#1e1c38' },
  instrumentRim: { width: 240, height: 240, borderRadius: 120, borderWidth: 1, borderColor: '#252347', backgroundColor: '#0e0d1d', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  compassDial: { position: 'absolute', width: 210, height: 210, borderRadius: 105, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#393668' },
  dialTag: { position: 'absolute', color: '#8e8ca8', fontSize: 13, fontWeight: '700', width: '100%', textAlign: 'center' },
  gyroReticle: { position: 'absolute', width: 80, height: 80, justifyContent: 'center', alignItems: 'center' },
  centerDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#00ff66', zIndex: 10 },
  laserX: { position: 'absolute', width: 50, height: 1, backgroundColor: 'rgba(0, 255, 102, 0.4)' },
  laserY: { position: 'absolute', width: 1, height: 50, backgroundColor: 'rgba(0, 255, 102, 0.4)' },
  deadzoneRing: { position: 'absolute', width: 46, height: 46, borderRadius: 23, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)' },
  hudWrapper: { flex: 0.8, flexDirection: 'row', justifyContent: 'space-between', marginBottom: 25 },
  hudCard: { flex: 0.47, backgroundColor: '#121124', borderRadius: 20, padding: 16, borderWidth: 1, borderColor: '#1e1c38', justifyContent: 'center' },
  hudLabel: { color: '#65628c', fontSize: 10, fontWeight: '800', letterSpacing: 2, marginBottom: 12 },
  hudValue: { color: '#ffffff', fontSize: 22, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Courier-Bold' : 'monospace' },
  degreeUnit: { fontSize: 15, color: '#00ff66' },
  hudSubtext: { color: '#49476b', fontSize: 9, fontWeight: '700', marginTop: 2, letterSpacing: 0.5 },
  actionButton: { width: '100%', height: 64, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  actionText: { fontSize: 15, fontWeight: '900', letterSpacing: 4 }
});