import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Text, Animated, Image, StatusBar } from 'react-native';

export default function SplashScreen({ onFinish }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.85)).current;

  useEffect(() => {
    // Smooth entry animation: fade in and scale up
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 900,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 6,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start(() => {
      // Hold for 1.5 seconds, then transition
      setTimeout(() => {
        if (onFinish) onFinish();
      }, 1500);
    });
  }, [fadeAnim, scaleAnim, onFinish]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      
      <Animated.View
        style={[
          styles.logoContainer,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        <Image
          source={require('../../assets/FCO-LOGOO.png')}
          style={styles.logo}
          resizeMode="contain"
        />

        <Text style={styles.appName}>ATENDER</Text>
        <Text style={styles.subText}>FEDERATED CLASS ORGANIZATION</Text>
        <Text style={styles.collegeText}>College of Engineering</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 200,
    height: 200,
    marginBottom: 20,
  },
  appName: {
    fontSize: 32,
    fontWeight: '900',
    color: '#8b0000', // Deep FCO Maroon
    letterSpacing: 4,
    marginBottom: 6,
  },
  subText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  collegeText: {
    fontSize: 14,
    color: '#b91c1c', // Maroon/Red accent
    marginTop: 4,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});