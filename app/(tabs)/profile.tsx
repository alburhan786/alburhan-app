import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  FlatList,
  ActivityIndicator,
  Platform,
  Linking,
  Modal,
  TextInput,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../contexts/AuthContext';
import { documentService, kycService } from '../../services/api';
import { Colors } from '../../constants/Colors';
import { getApiUrl } from '../../lib/query-client';
import { registerDeviceToken, resetRegistration } from '../../lib/notifications';

const DOC_TYPES = [
  { value: 'passport', label: 'Passport', icon: 'document-text-outline' as const },
  { value: 'pancard', label: 'PAN Card', icon: 'card-outline' as const },
  { value: 'aadhar', label: 'Aadhar Card', icon: 'finger-print-outline' as const },
  { value: 'digital_photo', label: 'Digital Photo (35x45mm)', icon: 'camera-outline' as const },
  { value: 'id_proof', label: 'ID Proof', icon: 'card-outline' as const },
  { value: 'medical', label: 'Medical', icon: 'medkit-outline' as const },
  { value: 'other', label: 'Other', icon: 'folder-outline' as const },
];

function getDocTypeBadge(type: string) {
  const found = DOC_TYPES.find(d => d.value === type);
  return found || { value: type, label: type, icon: 'document-outline' as const };
}

function KycDocPreview({ doc, resolveUrl }: { doc: any; resolveUrl: (url: string) => string }) {
  const ext = (doc.fileName || '').split('.').pop()?.toLowerCase() || '';
  const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext);
  const url = resolveUrl(doc.fileUrl);
  const statusConfig = doc.status === 'approved'
    ? { label: '🟢 Approved', color: '#065f46' }
    : doc.status === 'rejected'
      ? { label: '🔴 Rejected', color: '#991b1b' }
      : { label: '🟡 Pending', color: '#92400e' };
  return (
    <View style={{ marginTop: 10, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#e5e7eb' }}>
      {isImage && url ? (
        <Image source={{ uri: url }} style={{ width: '100%', height: 120, resizeMode: 'cover' }} />
      ) : (
        <View style={{ height: 60, backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 8 }}>
          <Ionicons name="document-text-outline" size={22} color="#6b7280" />
          <Text style={{ fontSize: 12, color: '#6b7280' }} numberOfLines={1}>{doc.fileName}</Text>
        </View>
      )}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 8, backgroundColor: '#fff' }}>
        <Text style={{ fontSize: 11, fontWeight: '700' as const, color: statusConfig.color }}>{statusConfig.label}</Text>
        {doc.adminComment ? <Text style={{ fontSize: 10, color: '#dc2626', flex: 1, marginLeft: 6 }} numberOfLines={1}>Reason: {doc.adminComment}</Text> : null}
        <Text style={{ fontSize: 10, color: '#9ca3af' }}>{doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString('en-IN') : ''}</Text>
      </View>
    </View>
  );
}

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [documents, setDocuments] = useState<any[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showDocuments, setShowDocuments] = useState(false);
  const [reregisteringNotif, setReregisteringNotif] = useState(false);

  // KYC state
  const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
  const [showKyc, setShowKyc] = useState(false);
  const [kycLoading, setKycLoading] = useState(false);
  const [kycSaving, setKycSaving] = useState<string | null>(null);
  const [uploadingKyc, setUploadingKyc] = useState<string | null>(null);
  const [aadharInput, setAadharInput] = useState('');
  const [panInput, setPanInput] = useState('');
  const [bloodGroupSelected, setBloodGroupSelected] = useState('');
  const [showBloodGroupModal, setShowBloodGroupModal] = useState(false);
  const [kycDocs, setKycDocs] = useState<{ aadhar?: any; pancard?: any; medical?: any }>({});
  const [kycPhotoUrl, setKycPhotoUrl] = useState<string | null>(null);
  const [uploadingKycPhoto, setUploadingKycPhoto] = useState(false);
  const [whatsappInput, setWhatsappInput] = useState('');

  const handleReregisterNotifications = async () => {
    if (reregisteringNotif) return;
    setReregisteringNotif(true);
    resetRegistration();
    const result = await registerDeviceToken(false);
    setReregisteringNotif(false);
    if (result.success) {
      Alert.alert('Notifications Enabled', 'Push notifications are now active on this device.');
    } else {
      Alert.alert('Setup Failed', result.error || 'Could not register for notifications. Check your internet connection and try again.');
    }
  };

  useEffect(() => {
    if (user && showDocuments) {
      loadDocuments();
    }
  }, [user, showDocuments]);

  useEffect(() => {
    if (user) {
      loadKycProfile();
      loadKycDocPreviews();
    }
  }, [user]);

  const loadDocuments = async () => {
    if (!user) return;
    setLoadingDocs(true);
    try {
      const response = await documentService.getUserDocuments(user.id);
      if (response.success) {
        setDocuments(response.documents || []);
      }
    } catch (error) {
      console.error('Failed to load documents:', error);
    } finally {
      setLoadingDocs(false);
    }
  };

  const handleUploadDocument = async () => {
    if (!user) return;

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const file = result.assets[0];

      const uploadFile = async (docType: string) => {
        setUploading(true);
        try {
          const response = await documentService.uploadDocument({
            userId: user.id,
            type: docType,
            fileName: file.name,
            fileUri: file.uri,
          });
          if (response.success) {
            Alert.alert('Success', 'Document uploaded successfully');
            loadDocuments();
          } else {
            Alert.alert('Error', response.error || 'Upload failed');
          }
        } catch (error: any) {
          Alert.alert('Error', error.message || 'Upload failed');
        } finally {
          setUploading(false);
        }
      };

      Alert.alert(
        'Select Document Type',
        'What type of document is this?',
        DOC_TYPES.map(dt => ({
          text: dt.value === 'digital_photo'
            ? `${dt.label}\n(35x45mm, 400x514px, JPG <60KB, White BG, Face 70-80%)`
            : dt.label,
          onPress: () => {
            if (dt.value === 'digital_photo') {
              Alert.alert(
                'Digital Photo Requirements',
                '• Dimension: 35mm x 45mm\n• Resolution: 400 x 514 pixels\n• Format: JPG, max 60KB\n• Face size: 70-80% of photo\n• Background: White\n• Borderless\n\nProceed with upload?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Upload', onPress: () => uploadFile(dt.value) },
                ]
              );
            } else {
              uploadFile(dt.value);
            }
          },
        }))
      );
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Could not pick document');
    }
  };

  const openPolicyUrl = (path: string) => {
    const base = getApiUrl().replace('/api', '');
    Linking.openURL(`${base}${path}`);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all your data including bookings and documents. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const url = new URL('/api/user/delete-account', getApiUrl());
              const response = await fetch(url.toString(), {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user?.id }),
              });
              const data = await response.json();
              if (data.success) {
                Alert.alert('Account Deleted', 'Your account has been permanently deleted.', [
                  { text: 'OK', onPress: () => logout() }
                ]);
              } else {
                Alert.alert('Error', data.error || 'Failed to delete account.');
              }
            } catch {
              Alert.alert('Error', 'Something went wrong. Please try again.');
            }
          }
        }
      ]
    );
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/(auth)/login');
          },
        },
      ]
    );
  };

  const resolveDocUrl = (fileUrl: string) => {
    if (!fileUrl) return '';
    if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) return fileUrl;
    const base = getApiUrl().replace(/\/$/, '');
    return base + (fileUrl.startsWith('/') ? fileUrl : '/' + fileUrl);
  };

  const openDocument = async (doc: any) => {
    const url = resolveDocUrl(doc.fileUrl);
    if (!url) {
      Alert.alert('Error', 'Document URL not available');
      return;
    }
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Cannot open', 'Unable to open this document on your device');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not open document');
    }
  };

  // ─── KYC helpers ────────────────────────────────────────────────────────────

  const loadKycProfile = async () => {
    if (!user) return;
    setKycLoading(true);
    try {
      const data = await kycService.getProfile();
      if (data.success) {
        setAadharInput(data.profile?.aadharNumber || '');
        setPanInput(data.profile?.panNumber || '');
        setBloodGroupSelected(data.profile?.bloodGroup || '');
        setKycPhotoUrl(data.profile?.photo || null);
        const wa = data.profile?.whatsappNumber || '';
        setWhatsappInput(wa || (user.phone ? user.phone.replace(/^\+91/, '').replace(/\D/g, '').slice(-10) : ''));
      } else {
        setWhatsappInput(user.phone ? user.phone.replace(/^\+91/, '').replace(/\D/g, '').slice(-10) : '');
      }
    } catch (e) {
      console.error('loadKycProfile error:', e);
    } finally {
      setKycLoading(false);
    }
  };

  const uploadProfilePhoto = async () => {
    if (!user) return;
    Alert.alert('Upload Profile Photo', 'Choose source:', [
      {
        text: 'Camera',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') { Alert.alert('Permission Denied', 'Camera permission is required.'); return; }
          const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85, allowsEditing: true, aspect: [1, 1] });
          if (!result.canceled && result.assets[0]) {
            const asset = result.assets[0];
            await doUploadProfilePhoto(asset.uri, asset.fileName || `photo_${Date.now()}.jpg`, asset.fileSize);
          }
        },
      },
      {
        text: 'Gallery',
        onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') { Alert.alert('Permission Denied', 'Gallery permission is required.'); return; }
          const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85, allowsEditing: true, aspect: [1, 1] });
          if (!result.canceled && result.assets[0]) {
            const asset = result.assets[0];
            await doUploadProfilePhoto(asset.uri, asset.fileName || `photo_${Date.now()}.jpg`, asset.fileSize);
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const doUploadProfilePhoto = async (uri: string, name: string, size?: number | null) => {
    const MAX_SIZE = 5 * 1024 * 1024;
    if (typeof size === 'number' && size > MAX_SIZE) {
      Alert.alert('File Too Large', 'Please select a photo smaller than 5 MB.'); return;
    }
    setUploadingKycPhoto(true);
    try {
      const result = await kycService.uploadPhoto(uri, name);
      if (result.success && result.photoUrl) {
        setKycPhotoUrl(result.photoUrl);
        Alert.alert('Photo Uploaded', 'Your profile photo has been saved.');
      } else {
        Alert.alert('Upload Failed', result.error || 'Could not upload photo.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not upload photo.');
    } finally {
      setUploadingKycPhoto(false);
    }
  };

  const loadKycDocPreviews = async () => {
    if (!user) return;
    try {
      const response = await documentService.getUserDocuments(user.id);
      if (response.success) {
        const docs = (response.documents || []) as any[];
        const latest = (type: string) => docs.filter((d: any) => d.type === type).sort((a: any, b: any) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())[0] || null;
        setKycDocs({ aadhar: latest('aadhar'), pancard: latest('pancard'), medical: latest('medical') });
      } else {
        setKycDocs({ aadhar: null, pancard: null, medical: null });
      }
    } catch (e) {
      console.error('loadKycDocPreviews error:', e);
    }
  };

  const saveKycField = async (field: 'aadhar' | 'pan' | 'bloodGroup') => {
    if (!user) return;
    const payload: Record<string, string> = {};
    if (field === 'aadhar') {
      if (aadharInput && !/^\d{12}$/.test(aadharInput)) {
        Alert.alert('Invalid Aadhar', 'Aadhar number must be exactly 12 digits.'); return;
      }
      payload.aadharNumber = aadharInput;
    } else if (field === 'pan') {
      if (panInput && !/^[A-Z0-9]{10}$/i.test(panInput)) {
        Alert.alert('Invalid PAN', 'PAN number must be exactly 10 alphanumeric characters.'); return;
      }
      payload.panNumber = panInput.toUpperCase();
    } else {
      payload.bloodGroup = bloodGroupSelected;
    }
    setKycSaving(field);
    try {
      const data = await kycService.saveProfile(payload);
      if (data.success) {
        Alert.alert('Saved', 'KYC information updated successfully.');
      } else {
        Alert.alert('Error', data.error || 'Failed to save.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to save.');
    } finally {
      setKycSaving(null);
    }
  };

  const doKycUpload = async (type: 'aadhar' | 'pancard' | 'medical', uri: string, name: string, size?: number) => {
    const MAX_SIZE = 5 * 1024 * 1024;
    if (typeof size === 'number' && size > MAX_SIZE) {
      Alert.alert('File Too Large', 'Please select a file smaller than 5 MB.'); return;
    }
    setUploadingKyc(type);
    try {
      const response = await documentService.uploadDocument({ userId: user!.id, type, fileName: name, fileUri: uri });
      if (response.success) {
        Alert.alert('Uploaded', 'Document uploaded successfully.');
        loadKycDocPreviews();
      } else {
        Alert.alert('Upload Failed', response.error || 'Upload failed.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not upload document');
    } finally {
      setUploadingKyc(null);
    }
  };

  const uploadKycDoc = (type: 'aadhar' | 'pancard' | 'medical') => {
    if (!user) return;
    const typeLabel = type === 'aadhar' ? 'Aadhar Card' : type === 'pancard' ? 'PAN Card' : 'Health Certificate';
    const cameraOption = {
      text: 'Camera',
      onPress: async () => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Permission Denied', 'Camera permission is required.'); return; }
        const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
        if (!result.canceled && result.assets[0]) {
          const asset = result.assets[0];
          const name = asset.fileName || `${type}_${Date.now()}.jpg`;
          await doKycUpload(type, asset.uri, name, asset.fileSize);
        }
      },
    };
    const galleryOption = {
      text: 'Gallery',
      onPress: async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Permission Denied', 'Gallery permission is required.'); return; }
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
        if (!result.canceled && result.assets[0]) {
          const asset = result.assets[0];
          const name = asset.fileName || `${type}_${Date.now()}.jpg`;
          await doKycUpload(type, asset.uri, name, asset.fileSize);
        }
      },
    };
    const fileOption = {
      text: type === 'medical' ? 'Files (PDF/Image)' : 'Files',
      onPress: async () => {
        try {
          const mimeTypes: string[] = type === 'medical' ? ['application/pdf', 'image/*'] : ['image/*'];
          const result = await DocumentPicker.getDocumentAsync({ type: mimeTypes, copyToCacheDirectory: true });
          if (!result.canceled && result.assets[0]) {
            const file = result.assets[0];
            await doKycUpload(type, file.uri, file.name, file.size ?? undefined);
          }
        } catch (e: any) {
          Alert.alert('Error', e.message || 'Could not pick file');
        }
      },
    };
    Alert.alert(`Upload ${typeLabel}`, 'Choose upload source:', [
      cameraOption,
      galleryOption,
      fileOption,
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  // ────────────────────────────────────────────────────────────────────────────

  const renderDocumentItem = (doc: any) => {
    const badge = getDocTypeBadge(doc.type);
    const ext = (doc.fileName || '').split('.').pop()?.toLowerCase() || '';
    const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext);
    const isPdf = ext === 'pdf';
    const docIcon = isPdf ? 'document-text' : isImage ? 'image' : badge.icon;
    const docStatus: string = doc.status || 'pending';
    const statusConfig = docStatus === 'approved'
      ? { label: '🟢 Approved', bg: '#d1fae5', color: '#065f46', border: '#6ee7b7' }
      : docStatus === 'rejected'
        ? { label: '🔴 Rejected', bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' }
        : { label: '🟡 Pending', bg: '#fef3c7', color: '#92400e', border: '#fcd34d' };
    return (
      <View style={styles.docItem}>
        <View style={styles.docIconContainer}>
          <Ionicons name={docIcon as any} size={22} color={Colors.primary} />
        </View>
        <View style={[styles.docInfo, { flex: 1 }]}>
          <Text style={styles.docName} numberOfLines={1}>{doc.fileName}</Text>
          <Text style={styles.docDate}>
            {doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString('en-IN') : '-'}
          </Text>
          <View style={{
            alignSelf: 'flex-start',
            marginTop: 4,
            paddingHorizontal: 8,
            paddingVertical: 2,
            borderRadius: 10,
            backgroundColor: statusConfig.bg,
            borderWidth: 1,
            borderColor: statusConfig.border,
          }}>
            <Text style={{ fontSize: 11, fontWeight: '700' as const, color: statusConfig.color }}>
              {statusConfig.label}
            </Text>
          </View>
          {docStatus === 'rejected' && doc.adminComment ? (
            <Text style={{ fontSize: 11, color: '#dc2626', marginTop: 2 }} numberOfLines={2}>
              Reason: {doc.adminComment}
            </Text>
          ) : null}
        </View>
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <View style={styles.docBadge}>
            <Text style={styles.docBadgeText}>{badge.label}</Text>
          </View>
          {doc.fileUrl ? (
            <TouchableOpacity
              onPress={() => openDocument(doc)}
              style={{ backgroundColor: Colors.primary, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5 }}
            >
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>View</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  };

  if (!user) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
          <View style={styles.headerBackRow}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
          <Text style={styles.headerTitle}>Profile</Text>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 }}>
          <Text style={{ fontSize: 20, fontWeight: 'bold' as const, color: Colors.text, marginBottom: 8 }}>Login Required</Text>
          <Text style={{ fontSize: 16, color: Colors.textSecondary, textAlign: 'center' as const, marginBottom: 24 }}>
            Please login to view your profile
          </Text>
          <TouchableOpacity
            style={{ backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 }}
            onPress={() => router.push('/(auth)/login')}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' as const }}>Login</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
        <View style={styles.headerBackRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
        <View style={styles.avatarContainer}>
          <Text style={styles.avatarText}>
            {user.name.charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text style={styles.headerTitle}>{user.name}</Text>
        <Text style={styles.headerSubtitle}>{user.email}</Text>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account Information</Text>

          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Full Name</Text>
              <Text style={styles.infoValue}>{user?.name}</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Email</Text>
              <Text style={styles.infoValue}>{user?.email}</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Phone</Text>
              <Text style={styles.infoValue}>{user?.phone}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/(tabs)/bookings')}
          >
            <View style={styles.actionLeft}>
              <Ionicons name="calendar-outline" size={20} color={Colors.primary} />
              <Text style={styles.actionText}>My Bookings</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.primary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/(tabs)/notifications')}
          >
            <View style={styles.actionLeft}>
              <Ionicons name="notifications-outline" size={20} color={Colors.primary} />
              <Text style={styles.actionText}>Notifications</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.primary} />
          </TouchableOpacity>

          {Platform.OS !== 'web' && (
            <TouchableOpacity
              style={styles.actionCard}
              onPress={handleReregisterNotifications}
              disabled={reregisteringNotif}
            >
              <View style={styles.actionLeft}>
                {reregisteringNotif ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : (
                  <Ionicons name="notifications-circle-outline" size={20} color={Colors.primary} />
                )}
                <Text style={styles.actionText}>
                  {reregisteringNotif ? 'Setting up...' : 'Enable Notifications'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.primary} />
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => setShowDocuments(!showDocuments)}
          >
            <View style={styles.actionLeft}>
              <Ionicons name="document-text-outline" size={20} color={Colors.primary} />
              <Text style={styles.actionText}>My Documents</Text>
            </View>
            <Ionicons name={showDocuments ? 'chevron-down' : 'chevron-forward'} size={20} color={Colors.primary} />
          </TouchableOpacity>

          {showDocuments && (
            <View style={styles.documentsSection}>
              <TouchableOpacity
                style={styles.uploadButton}
                onPress={handleUploadDocument}
                disabled={uploading}
              >
                {uploading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <View style={styles.uploadButtonRow}>
                    <Ionicons name="cloud-upload-outline" size={20} color="#FFFFFF" />
                    <Text style={styles.uploadButtonText}>Upload Document</Text>
                  </View>
                )}
              </TouchableOpacity>

              {loadingDocs ? (
                <ActivityIndicator size="small" color={Colors.primary} style={{ marginTop: 16 }} />
              ) : documents.length === 0 ? (
                <View style={styles.emptyDocs}>
                  <Ionicons name="folder-open-outline" size={32} color={Colors.textSecondary} />
                  <Text style={styles.emptyDocsText}>No documents uploaded yet</Text>
                </View>
              ) : (
                documents.map((doc, index) => (
                  <View key={doc.id || index}>{renderDocumentItem(doc)}</View>
                ))
              )}
            </View>
          )}

        </View>

        {/* KYC & Identity Documents Section */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => {
              setShowKyc(prev => !prev);
            }}
          >
            <View style={styles.actionLeft}>
              <Ionicons name="finger-print-outline" size={20} color={Colors.primary} />
              <Text style={styles.actionText}>KYC & Identity</Text>
            </View>
            <Ionicons name={showKyc ? 'chevron-up' : 'chevron-forward'} size={20} color={Colors.primary} />
          </TouchableOpacity>

          {showKyc && (
            <View style={styles.kycSection}>
              {kycLoading ? (
                <ActivityIndicator size="small" color={Colors.primary} style={{ marginVertical: 16 }} />
              ) : (
                <>
                  {/* Profile Photo */}
                  <View style={styles.kycCard}>
                    <View style={styles.kycCardHeader}>
                      <Ionicons name="camera-outline" size={20} color={Colors.primary} />
                      <Text style={styles.kycCardTitle}>Profile Photo</Text>
                    </View>
                    <View style={{ alignItems: 'center', marginVertical: 12 }}>
                      {kycPhotoUrl ? (
                        <Image
                          source={{ uri: resolveDocUrl(kycPhotoUrl) }}
                          style={{ width: 90, height: 90, borderRadius: 45, borderWidth: 2, borderColor: Colors.primary, marginBottom: 10 }}
                        />
                      ) : (
                        <View style={{ width: 90, height: 90, borderRadius: 45, backgroundColor: '#f3f4f6', borderWidth: 2, borderColor: '#e5e7eb', justifyContent: 'center', alignItems: 'center', marginBottom: 10 }}>
                          <Ionicons name="person-outline" size={40} color="#9ca3af" />
                        </View>
                      )}
                      <TouchableOpacity
                        style={[styles.kycSaveBtn, uploadingKycPhoto && styles.kycBtnDisabled, { paddingHorizontal: 20 }]}
                        onPress={uploadProfilePhoto}
                        disabled={uploadingKycPhoto}
                      >
                        {uploadingKycPhoto ? <ActivityIndicator size="small" color="#fff" /> : (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Ionicons name="camera-outline" size={15} color="#fff" />
                            <Text style={styles.kycSaveBtnText}>{kycPhotoUrl ? 'Change Photo' : 'Upload Photo'}</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Aadhar Card */}
                  <View style={styles.kycCard}>
                    <View style={styles.kycCardHeader}>
                      <Ionicons name="finger-print-outline" size={20} color={Colors.primary} />
                      <Text style={styles.kycCardTitle}>Aadhar Card</Text>
                    </View>
                    <TextInput
                      style={styles.kycInput}
                      value={aadharInput}
                      onChangeText={t => setAadharInput(t.replace(/\D/g, '').slice(0, 12))}
                      placeholder="12-digit Aadhar Number"
                      keyboardType="number-pad"
                      maxLength={12}
                      placeholderTextColor={Colors.textSecondary}
                    />
                    {aadharInput.length > 0 && aadharInput.length !== 12 && (
                      <Text style={styles.kycValidationError}>Must be exactly 12 digits ({aadharInput.length}/12)</Text>
                    )}
                    <View style={styles.kycActions}>
                      <TouchableOpacity
                        style={[styles.kycSaveBtn, kycSaving === 'aadhar' && styles.kycBtnDisabled]}
                        onPress={() => saveKycField('aadhar')}
                        disabled={kycSaving === 'aadhar'}
                      >
                        {kycSaving === 'aadhar' ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.kycSaveBtnText}>Save</Text>}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.kycUploadBtn, uploadingKyc === 'aadhar' && styles.kycBtnDisabled]}
                        onPress={() => uploadKycDoc('aadhar')}
                        disabled={uploadingKyc === 'aadhar'}
                      >
                        {uploadingKyc === 'aadhar' ? <ActivityIndicator size="small" color={Colors.primary} /> : (
                          <View style={styles.kycUploadBtnRow}>
                            <Ionicons name="cloud-upload-outline" size={15} color={Colors.primary} />
                            <Text style={styles.kycUploadBtnText}>Upload Image</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    </View>
                    {kycDocs.aadhar && (
                      <KycDocPreview doc={kycDocs.aadhar} resolveUrl={resolveDocUrl} />
                    )}
                  </View>

                  {/* PAN Card */}
                  <View style={styles.kycCard}>
                    <View style={styles.kycCardHeader}>
                      <Ionicons name="card-outline" size={20} color={Colors.primary} />
                      <Text style={styles.kycCardTitle}>PAN Card</Text>
                    </View>
                    <TextInput
                      style={styles.kycInput}
                      value={panInput}
                      onChangeText={t => setPanInput(t.toUpperCase().slice(0, 10))}
                      placeholder="10-character PAN Number"
                      autoCapitalize="characters"
                      maxLength={10}
                      placeholderTextColor={Colors.textSecondary}
                    />
                    {panInput.length > 0 && panInput.length !== 10 && (
                      <Text style={styles.kycValidationError}>Must be exactly 10 characters ({panInput.length}/10)</Text>
                    )}
                    {panInput.length === 10 && !/^[A-Z0-9]{10}$/.test(panInput) && (
                      <Text style={styles.kycValidationError}>Only letters and numbers are allowed</Text>
                    )}
                    <View style={styles.kycActions}>
                      <TouchableOpacity
                        style={[styles.kycSaveBtn, kycSaving === 'pan' && styles.kycBtnDisabled]}
                        onPress={() => saveKycField('pan')}
                        disabled={kycSaving === 'pan'}
                      >
                        {kycSaving === 'pan' ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.kycSaveBtnText}>Save</Text>}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.kycUploadBtn, uploadingKyc === 'pancard' && styles.kycBtnDisabled]}
                        onPress={() => uploadKycDoc('pancard')}
                        disabled={uploadingKyc === 'pancard'}
                      >
                        {uploadingKyc === 'pancard' ? <ActivityIndicator size="small" color={Colors.primary} /> : (
                          <View style={styles.kycUploadBtnRow}>
                            <Ionicons name="cloud-upload-outline" size={15} color={Colors.primary} />
                            <Text style={styles.kycUploadBtnText}>Upload Image</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    </View>
                    {kycDocs.pancard && (
                      <KycDocPreview doc={kycDocs.pancard} resolveUrl={resolveDocUrl} />
                    )}
                  </View>

                  {/* Health Section */}
                  <View style={styles.kycCard}>
                    <View style={styles.kycCardHeader}>
                      <Ionicons name="medkit-outline" size={20} color={Colors.primary} />
                      <Text style={styles.kycCardTitle}>Health Information</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.bloodGroupSelector}
                      onPress={() => setShowBloodGroupModal(true)}
                    >
                      <Ionicons name="water-outline" size={18} color={Colors.primary} />
                      <Text style={[styles.bloodGroupText, !bloodGroupSelected && { color: Colors.textSecondary }]}>
                        {bloodGroupSelected || 'Select Blood Group'}
                      </Text>
                      <Ionicons name="chevron-down" size={16} color={Colors.textSecondary} />
                    </TouchableOpacity>
                    <View style={styles.kycActions}>
                      <TouchableOpacity
                        style={[styles.kycSaveBtn, (!bloodGroupSelected || kycSaving === 'bloodGroup') && styles.kycBtnDisabled]}
                        onPress={() => saveKycField('bloodGroup')}
                        disabled={!bloodGroupSelected || kycSaving === 'bloodGroup'}
                      >
                        {kycSaving === 'bloodGroup' ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.kycSaveBtnText}>Save</Text>}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.kycUploadBtn, uploadingKyc === 'medical' && styles.kycBtnDisabled]}
                        onPress={() => uploadKycDoc('medical')}
                        disabled={uploadingKyc === 'medical'}
                      >
                        {uploadingKyc === 'medical' ? <ActivityIndicator size="small" color={Colors.primary} /> : (
                          <View style={styles.kycUploadBtnRow}>
                            <Ionicons name="cloud-upload-outline" size={15} color={Colors.primary} />
                            <Text style={styles.kycUploadBtnText}>Health Certificate</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    </View>
                    {kycDocs.medical && (
                      <KycDocPreview doc={kycDocs.medical} resolveUrl={resolveDocUrl} />
                    )}
                  </View>

                  {/* WhatsApp Number */}
                  <View style={styles.kycCard}>
                    <View style={styles.kycCardHeader}>
                      <Ionicons name="logo-whatsapp" size={20} color="#25D366" />
                      <Text style={styles.kycCardTitle}>WhatsApp Number</Text>
                    </View>
                    <TextInput
                      style={styles.kycInput}
                      value={whatsappInput}
                      onChangeText={t => setWhatsappInput(t.replace(/\D/g, '').slice(0, 10))}
                      placeholder="10-digit WhatsApp number"
                      keyboardType="number-pad"
                      maxLength={10}
                      placeholderTextColor={Colors.textSecondary}
                    />
                    {whatsappInput.length > 0 && whatsappInput.length !== 10 && (
                      <Text style={styles.kycValidationError}>Must be exactly 10 digits ({whatsappInput.length}/10)</Text>
                    )}
                    <View style={styles.kycActions}>
                      <TouchableOpacity
                        style={[styles.kycSaveBtn, (whatsappInput.length !== 10 || kycSaving === 'whatsapp') && styles.kycBtnDisabled]}
                        onPress={async () => {
                          if (whatsappInput.length !== 10) { Alert.alert('Invalid', 'Enter a valid 10-digit WhatsApp number.'); return; }
                          setKycSaving('whatsapp');
                          try {
                            const data = await kycService.saveProfile({ whatsappNumber: whatsappInput });
                            if (data.success) { Alert.alert('Saved', 'WhatsApp number updated.'); }
                            else { Alert.alert('Error', data.error || 'Failed to save.'); }
                          } catch (e: any) { Alert.alert('Error', e.message || 'Failed to save.'); }
                          finally { setKycSaving(null); }
                        }}
                        disabled={whatsappInput.length !== 10 || kycSaving === 'whatsapp'}
                      >
                        {kycSaving === 'whatsapp' ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.kycSaveBtnText}>Save</Text>}
                      </TouchableOpacity>
                    </View>
                  </View>
                </>
              )}
            </View>
          )}
        </View>

        {/* Blood Group Modal */}
        <Modal visible={showBloodGroupModal} transparent animationType="fade" onRequestClose={() => setShowBloodGroupModal(false)}>
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowBloodGroupModal(false)}>
            <View style={styles.modalContainer}>
              <Text style={styles.modalTitle}>Select Blood Group</Text>
              <View style={styles.bloodGroupGrid}>
                {BLOOD_GROUPS.map(bg => (
                  <TouchableOpacity
                    key={bg}
                    style={[styles.bloodGroupOption, bloodGroupSelected === bg && styles.bloodGroupOptionSelected]}
                    onPress={() => { setBloodGroupSelected(bg); setShowBloodGroupModal(false); }}
                  >
                    <Text style={[styles.bloodGroupOptionText, bloodGroupSelected === bg && styles.bloodGroupOptionTextSelected]}>{bg}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowBloodGroupModal(false)}>
                <Text style={styles.modalCloseBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Contact Us</Text>

          <View style={styles.contactCard}>
            <TouchableOpacity style={styles.contactRow} onPress={() => Linking.openURL('tel:+919893225590')}>
              <Ionicons name="call" size={20} color={Colors.primary} />
              <View style={styles.contactInfo}>
                <Text style={styles.contactLabel}>Main Office</Text>
                <Text style={styles.contactValue}>+91 9893225590</Text>
              </View>
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity style={styles.contactRow} onPress={() => Linking.openURL('tel:+919893989786')}>
              <Ionicons name="call-outline" size={20} color={Colors.primary} />
              <View style={styles.contactInfo}>
                <Text style={styles.contactLabel}>Booking Enquiry</Text>
                <Text style={styles.contactValue}>+91 9893989786</Text>
              </View>
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity style={styles.contactRow} onPress={() => Linking.openURL('https://wa.me/919893989786?text=Assalamu%20Alaikum%20I%20want%20to%20register%20for%20Hajj%202027%20package%20with%20Al%20Burhan%20Tours%20and%20Travels')}>
              <Ionicons name="logo-whatsapp" size={20} color="#25D366" />
              <View style={styles.contactInfo}>
                <Text style={styles.contactLabel}>WhatsApp Chat</Text>
                <Text style={styles.contactValue}>+91 9893989786</Text>
              </View>
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity style={styles.contactRow} onPress={() => Linking.openURL('mailto:support@alburhantravels.com')}>
              <Ionicons name="mail" size={20} color={Colors.primary} />
              <View style={styles.contactInfo}>
                <Text style={styles.contactLabel}>Email</Text>
                <Text style={styles.contactValue}>support@alburhantravels.com</Text>
              </View>
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity style={styles.contactRow} onPress={() => Linking.openURL('https://www.alburhantravels.com')}>
              <Ionicons name="globe" size={20} color={Colors.primary} />
              <View style={styles.contactInfo}>
                <Text style={styles.contactLabel}>Website</Text>
                <Text style={styles.contactValue}>www.alburhantravels.com</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Follow Us</Text>

          <View style={styles.socialRow}>
            <TouchableOpacity style={styles.socialButton} onPress={() => Linking.openURL('https://instagram.com/alburhantravels')}>
              <Ionicons name="logo-instagram" size={26} color="#E1306C" />
              <Text style={styles.socialLabel}>Instagram</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.socialButton} onPress={() => Linking.openURL('https://facebook.com/alburhantravels')}>
              <Ionicons name="logo-facebook" size={26} color="#1877F2" />
              <Text style={styles.socialLabel}>Facebook</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.socialButton} onPress={() => Linking.openURL('https://youtube.com/@alburhantravels')}>
              <Ionicons name="logo-youtube" size={26} color="#FF0000" />
              <Text style={styles.socialLabel}>YouTube</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Legal</Text>
          <View style={styles.contactCard}>
            <TouchableOpacity style={styles.policyRow} onPress={() => openPolicyUrl('/privacy-policy')}>
              <Ionicons name="shield-checkmark-outline" size={18} color={Colors.primary} />
              <Text style={styles.policyLabel}>Privacy Policy</Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.textSecondary} />
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity style={styles.policyRow} onPress={() => openPolicyUrl('/terms-and-conditions')}>
              <Ionicons name="document-text-outline" size={18} color={Colors.primary} />
              <Text style={styles.policyLabel}>Terms & Conditions</Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.textSecondary} />
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity style={styles.policyRow} onPress={() => openPolicyUrl('/refund-policy')}>
              <Ionicons name="return-down-back-outline" size={18} color={Colors.primary} />
              <Text style={styles.policyLabel}>Refund & Cancellation Policy</Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={handleLogout}
          >
            <Text style={styles.logoutButtonText}>Logout</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.deleteAccountButton}
            onPress={handleDeleteAccount}
          >
            <Ionicons name="trash-outline" size={16} color={Colors.error} />
            <Text style={styles.deleteAccountText}>Delete My Account</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>AL BURHAN TOURS & TRAVELS</Text>
          <Text style={styles.footerSubtext}>Version 1.0.0</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    backgroundColor: Colors.primary,
    padding: 20,
    paddingBottom: 40,
    alignItems: 'center',
  },
  headerBackRow: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  backBtn: {
    padding: 4,
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: 'bold' as const,
    color: '#FFFFFF',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold' as const,
    color: '#FFFFFF',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold' as const,
    color: Colors.text,
    marginBottom: 12,
  },
  infoCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  infoLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
  },
  actionCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  actionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionText: {
    fontSize: 16,
    color: Colors.text,
    fontWeight: '500' as const,
  },
  documentsSection: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  uploadButton: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  uploadButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  uploadButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600' as const,
  },
  emptyDocs: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyDocsText: {
    color: Colors.textSecondary,
    fontSize: 14,
    marginTop: 8,
  },
  docItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    marginTop: 8,
  },
  docIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  docInfo: {
    flex: 1,
  },
  docName: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  docDate: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  docBadge: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  docBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600' as const,
  },
  contactCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 4,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 14,
  },
  contactInfo: {
    flex: 1,
  },
  contactLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  contactValue: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
    marginTop: 2,
  },
  socialRow: {
    flexDirection: 'row',
    gap: 12,
  },
  socialButton: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    gap: 8,
  },
  socialLabel: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  policyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    gap: 12,
  },
  policyLabel: {
    flex: 1,
    fontSize: 14,
    color: Colors.text,
    fontWeight: '500' as const,
  },
  logoutButton: {
    backgroundColor: Colors.error,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  logoutButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold' as const,
  },
  deleteAccountButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: Colors.error,
    borderRadius: 12,
  },
  deleteAccountText: {
    color: Colors.error,
    fontSize: 15,
    fontWeight: '600' as const,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  footerText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600' as const,
  },
  footerSubtext: {
    fontSize: 10,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  // KYC styles
  kycSection: {
    marginTop: 4,
  },
  kycCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  kycCardHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    marginBottom: 12,
  },
  kycCardTitle: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  kycInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.text,
    backgroundColor: Colors.background,
  },
  kycValidationError: {
    fontSize: 11,
    color: '#dc2626',
    marginTop: 4,
  },
  kycActions: {
    flexDirection: 'row' as const,
    gap: 8,
    marginTop: 10,
  },
  kycSaveBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 9,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    minWidth: 70,
  },
  kycSaveBtnText: {
    color: '#fff',
    fontWeight: '700' as const,
    fontSize: 13,
  },
  kycUploadBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  kycUploadBtnRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
  },
  kycUploadBtnText: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '600' as const,
  },
  kycBtnDisabled: {
    opacity: 0.5,
  },
  bloodGroupSelector: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 8,
    backgroundColor: Colors.background,
  },
  bloodGroupText: {
    flex: 1,
    fontSize: 14,
    color: Colors.text,
    fontWeight: '500' as const,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: 24,
  },
  modalContainer: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 340,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 16,
    textAlign: 'center' as const,
  },
  bloodGroupGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    justifyContent: 'center' as const,
    marginBottom: 16,
  },
  bloodGroupOption: {
    width: 64,
    height: 44,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: Colors.background,
  },
  bloodGroupOptionSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  bloodGroupOptionText: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  bloodGroupOptionTextSelected: {
    color: '#fff',
  },
  modalCloseBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 10,
    alignItems: 'center' as const,
  },
  modalCloseBtnText: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '600' as const,
  },
});
