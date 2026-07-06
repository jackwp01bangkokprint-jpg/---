import React, { useState, useEffect, useRef } from 'react';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged, 
  User 
} from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  updateDoc, 
  doc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  serverTimestamp 
} from 'firebase/firestore';
import { 
  motion, 
  AnimatePresence 
} from 'motion/react';
import { 
  Car, 
  Truck, 
  Zap, 
  LogOut, 
  Calendar, 
  Clock, 
  Battery, 
  Gauge, 
  Camera, 
  AlertTriangle, 
  CheckCircle2, 
  History, 
  Plus, 
  ChevronRight, 
  ChevronDown,
  User as UserIcon,
  HelpCircle,
  FileText,
  Search,
  Check
} from 'lucide-react';

import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { VEHICLES } from './vehiclesData';
import { VehicleLog, Vehicle } from './types';
import { compressImage } from './imageUtils';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<VehicleLog[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Checkout Form State
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const [outDate, setOutDate] = useState<string>('');
  const [outTime, setOutTime] = useState<string>('');
  const [outBattery, setOutBattery] = useState<number>(100);
  const [outMileage, setOutMileage] = useState<number>(0);
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  // Return Form Modal / Section State
  const [returningLog, setReturningLog] = useState<VehicleLog | null>(null);
  const [returnBattery, setReturnBattery] = useState<number>(100);
  const [returnMileage, setReturnMileage] = useState<number>(0);
  const [returnIssues, setReturnIssues] = useState<string>('ปกติ');
  const [returnDate, setReturnDate] = useState<string>('');
  const [returnTime, setReturnTime] = useState<string>('');

  // UI States
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'checkout' | 'history'>('checkout');
  const [showGuide, setShowGuide] = useState<boolean>(false);

  const selectedVehicle = VEHICLES.find(v => v.id === selectedVehicleId);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [dropdownRef]);

  const filteredVehicles = VEHICLES.filter((vehicle) => {
    const q = searchQuery.toLowerCase();
    return (
      vehicle.name.toLowerCase().includes(q) ||
      vehicle.plate.toLowerCase().includes(q) ||
      (vehicle.type && vehicle.type.toLowerCase().includes(q))
    );
  });

  // Load current date & time on mount or selection
  useEffect(() => {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0].substring(0, 5);
    setOutDate(dateStr);
    setOutTime(timeStr);
    setReturnDate(dateStr);
    setReturnTime(timeStr);
  }, []);

  // Auth Observer
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
      if (currentUser) {
        setErrorMsg(null);
      }
    });
    return unsubscribe;
  }, []);

  // Subscribe to Vehicle Logs
  useEffect(() => {
    if (!user) {
      setLogs([]);
      return;
    }

    const q = query(
      collection(db, 'vehicle_logs'),
      where('userEmail', '==', user.email),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetchedLogs: VehicleLog[] = [];
        snapshot.forEach((docSnap) => {
          fetchedLogs.push({
            id: docSnap.id,
            ...docSnap.data()
          } as VehicleLog);
        });
        setLogs(fetchedLogs);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'vehicle_logs');
      }
    );

    return unsubscribe;
  }, [user]);

  // Handle Login
  const handleLogin = async () => {
    setErrorMsg(null);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      setErrorMsg('ไม่สามารถเข้าสู่ระบบได้: ' + err.message);
    }
  };

  // Handle Logout
  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err: any) {
      setErrorMsg('ไม่สามารถออกจากระบบได้: ' + err.message);
    }
  };

  // Handle Drag Events for Photos
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  // Handle Drop or File selection for Photos
  const handleFileChange = async (files: FileList | null) => {
    if (!files) return;
    setUploadingPhotos(true);
    setErrorMsg(null);

    const fileList = Array.from(files);
    
    if (fileList.length + photos.length > 5) {
      setErrorMsg('สามารถเลือกรูปภาพสภาพรถได้สูงสุด 5 รูปเท่านั้น');
      setUploadingPhotos(false);
      return;
    }

    try {
      const compressedUrls: string[] = [];
      for (const file of fileList) {
        const compressed = await compressImage(file, 600, 600, 0.7);
        compressedUrls.push(compressed);
      }
      setPhotos(prev => [...prev, ...compressedUrls]);
    } catch (err) {
      setErrorMsg('เกิดข้อผิดพลาดในการอัปโหลดรูปภาพ');
    } finally {
      setUploadingPhotos(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files) {
      await handleFileChange(e.dataTransfer.files);
    }
  };

  const clearPhotos = () => {
    setPhotos([]);
    setErrorMsg(null);
  };

  // Checkout Form Submit
  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!user) {
      setErrorMsg('กรุณาเข้าสู่ระบบก่อนทำรายการ');
      return;
    }

    if (!selectedVehicleId) {
      setErrorMsg('กรุณาเลือกรถที่ต้องการใช้');
      return;
    }

    if (photos.length < 5) {
      setErrorMsg(`กรุณาถ่ายรูปภาพให้ครบ 5 ด้าน (เลือกแล้ว ${photos.length}/5 รูป)`);
      return;
    }

    const vehicle = VEHICLES.find(v => v.id === selectedVehicleId);
    if (!vehicle) {
      setErrorMsg('ไม่พบข้อมูลรถยนต์ที่เลือก');
      return;
    }

    // Check if user already has an active checkout for the same car
    const isCarActive = logs.some(log => log.carId === selectedVehicleId && log.status === 'active');
    if (isCarActive) {
      setErrorMsg(`รถยนต์คันนี้กำลังถูกใช้งานอยู่และยังไม่ได้คืน`);
      return;
    }

    try {
      const logData = {
        userEmail: user.email,
        userName: user.displayName || user.email,
        carId: vehicle.id,
        carName: `${vehicle.name} (${vehicle.plate})`,
        status: 'active',
        checkout: {
          date: outDate,
          time: outTime,
          battery: Number(outBattery),
          mileage: Number(outMileage),
          photos: photos
        },
        return: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await addDoc(collection(db, 'vehicle_logs'), logData);
      
      setSuccessMsg('บันทึกการเบิกรถเรียบร้อยแล้ว!');
      // Reset Form State
      setSelectedVehicleId('');
      setPhotos([]);
      setOutBattery(100);
      setOutMileage(0);

      // Scroll to top
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'vehicle_logs');
    }
  };

  // Open Return Form
  const initiateReturn = (log: VehicleLog) => {
    const now = new Date();
    setReturningLog(log);
    setReturnBattery(log.checkout.battery);
    setReturnMileage(log.checkout.mileage);
    setReturnIssues('ปกติ');
    setReturnDate(now.toISOString().split('T')[0]);
    setReturnTime(now.toTimeString().split(' ')[0].substring(0, 5));
    setErrorMsg(null);

    // Smooth scroll to return form container
    setTimeout(() => {
      const el = document.getElementById('return-form-container');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  };

  // Submit Return Form
  const handleReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!returningLog || !returningLog.id) return;

    if (Number(returnMileage) < returningLog.checkout.mileage) {
      setErrorMsg(`เลขไมล์ขากลับ (${returnMileage} กม.) ต้องไม่น้อยกว่าเลขไมล์ตอนออก (${returningLog.checkout.mileage} กม.)`);
      return;
    }

    try {
      const logDocRef = doc(db, 'vehicle_logs', returningLog.id);
      await updateDoc(logDocRef, {
        status: 'returned',
        return: {
          date: returnDate,
          time: returnTime,
          battery: Number(returnBattery),
          mileage: Number(returnMileage),
          issues: returnIssues
        },
        updatedAt: serverTimestamp()
      });

      setSuccessMsg(`ทำรายการคืนรถ ${returningLog.carName} เรียบร้อยแล้ว!`);
      setReturningLog(null);
      
      // Expand history tab to let user see it
      setActiveTab('history');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `vehicle_logs/${returningLog.id}`);
    }
  };

  // Active (Unreturned) rentals of current user
  const activeRentals = logs.filter(log => log.status === 'active');

  // Dynamic calculations for High Density summary cards
  const readyVehiclesCount = VEHICLES.length - activeRentals.length;
  
  const totalDistance = logs.reduce((sum, log) => {
    if (log.status === 'returned' && log.return) {
      const diff = log.return.mileage - log.checkout.mileage;
      return sum + (diff > 0 ? diff : 0);
    }
    return sum;
  }, 0);

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-slate-800 font-sans antialiased selection:bg-emerald-100 selection:text-emerald-900">
      
      {/* Dynamic Notification Messages */}
      <AnimatePresence>
        {errorMsg && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 left-4 right-4 z-50 mx-auto max-w-xl rounded-xl border border-rose-200 bg-rose-50 p-4 shadow-xl flex items-start gap-3"
          >
            <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-semibold text-rose-900 text-sm font-display">แจ้งเตือนข้อผิดพลาด</h4>
              <p className="text-xs text-rose-700 mt-0.5">{errorMsg}</p>
            </div>
            <button onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-rose-600 text-xs font-bold px-2 py-1">ปิด</button>
          </motion.div>
        )}

        {successMsg && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 left-4 right-4 z-50 mx-auto max-w-xl rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-xl flex items-start gap-3"
          >
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-semibold text-emerald-900 text-sm font-display">สำเร็จ</h4>
              <p className="text-xs text-emerald-700 mt-0.5">{successMsg}</p>
            </div>
            <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-emerald-600 text-xs font-bold px-2 py-1">ปิด</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading Overlay */}
      {loading && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-xl shadow-xl flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-emerald-600 border-t-transparent"></div>
            <p className="text-slate-600 text-xs font-medium">กำลังเตรียมระบบ...</p>
          </div>
        </div>
      )}

      {/* Login Screen */}
      {!user && !loading && (
        <div className="min-h-screen flex items-center justify-center p-4 bg-slate-900 relative overflow-hidden">
          {/* Subtle Ambient Background Graphics */}
          <div className="absolute top-0 left-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-0 right-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />
          
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="w-full max-w-md bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl p-8 relative z-10 text-center"
          >
            <div className="mx-auto w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center border border-emerald-500/20 mb-6">
              <Car className="h-6 w-6 text-emerald-400" />
            </div>

            <h1 className="text-xl font-bold text-white tracking-tight font-display">
              WP-WRT Vehicle Log
            </h1>
            <p className="text-slate-400 text-xs mt-2">
              ระบบบันทึกการใช้รถยนต์และเบิกจ่ายพาหนะของบริษัท
            </p>

            <div className="my-6 border-t border-slate-700/60" />

            <button
              onClick={handleLogin}
              className="w-full flex items-center justify-center gap-3 bg-white text-slate-900 hover:bg-slate-50 active:bg-slate-100 font-semibold py-3 px-4 rounded-xl shadow-md transition-all border border-slate-200 cursor-pointer text-sm"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              เข้าสู่ระบบด้วย Google Account
            </button>

            <p className="text-[10px] text-slate-500 mt-6 leading-relaxed">
              * กรุณาใช้บัญชีอีเมลบริษัท (@gmail หรือ Google Space) เพื่อความปลอดภัยในการเข้าถึงข้อมูล
            </p>
          </motion.div>
        </div>
      )}

      {/* Authenticated Dashboard */}
      {user && !loading && (
        <div className="flex-1 flex flex-col min-h-0">
          
          {/* Global Header */}
          <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 sm:px-6 shrink-0 shadow-sm z-10">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-9 h-9 sm:w-10 sm:h-10 bg-emerald-600 rounded-lg flex items-center justify-center text-white font-bold text-xs sm:text-sm">
                WRT
              </div>
              <div>
                <h1 className="text-xs sm:text-sm font-bold tracking-tight text-slate-900 leading-tight">WP-WRT Vehicle Log</h1>
                <p className="text-[9px] sm:text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Vehicle Management System</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2 sm:gap-4">
              <div className="text-right hidden md:block">
                <p className="text-xs font-semibold text-slate-700 leading-none">{user.displayName || 'สมชาย รักงานบริการ'}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">{user.email || 'somchai.r@company.co.th'}</p>
              </div>
              
              {user.photoURL ? (
                <img 
                  src={user.photoURL} 
                  alt={user.displayName || 'User'} 
                  className="w-8 h-8 sm:w-10 sm:h-10 rounded-full border border-slate-200 object-cover" 
                />
              ) : (
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
                  <div className="bg-slate-300 w-full h-full flex items-center justify-center text-slate-600 text-[10px] sm:text-xs font-bold">
                    {(user.displayName || user.email || 'SR').substring(0, 2).toUpperCase()}
                  </div>
                </div>
              )}

              <button 
                onClick={() => setShowGuide(true)}
                className="px-2 py-1 sm:px-3 sm:py-1.5 text-[10px] sm:text-xs font-semibold text-emerald-600 border border-emerald-200 rounded-md hover:bg-emerald-50 transition-colors cursor-pointer flex items-center gap-1"
              >
                <HelpCircle className="h-3.5 w-3.5" />
                คู่มือการใช้งาน
              </button>

              <button 
                onClick={handleLogout}
                className="px-2 py-1 sm:px-3 sm:py-1.5 text-[10px] sm:text-xs font-semibold text-rose-600 border border-rose-200 rounded-md hover:bg-rose-50 transition-colors cursor-pointer"
              >
                ออกจากระบบ
              </button>
            </div>
          </header>

          {/* Main Content Area */}
          <main className="flex flex-col lg:flex-row flex-1 gap-6 p-6 min-h-0 overflow-y-auto lg:overflow-hidden bg-[#F8FAFC]">
            
            {/* Left Column: Checkout Form */}
            <section className="w-full lg:w-[480px] bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col shrink-0">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2 shrink-0">
                <div className="w-2 h-4 bg-emerald-500 rounded-full"></div>
                <h2 className="font-bold text-slate-800 text-sm">แบบบันทึกการนำรถออก (Checkout)</h2>
              </div>
              
              <form onSubmit={handleCheckoutSubmit} className="flex-1 flex flex-col min-h-0">
                <div className="flex-1 p-6 space-y-5 overflow-y-auto">
                  
                  {/* Warning banner when there are active rentals */}
                  {activeRentals.length > 0 && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col gap-3 shadow-sm"
                    >
                      <div className="flex items-start gap-2.5">
                        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <h4 className="font-bold text-amber-900 text-xs">คุณมียานพาหนะที่ยังไม่ได้ส่งคืน!</h4>
                          <p className="text-[10px] text-amber-700 mt-1 leading-relaxed">
                            คุณมีรถที่เบิกค้างไว้จำนวน <b>{activeRentals.length} คัน</b> กรุณาส่งคืนเมื่อใช้งานเสร็จสิ้น
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const el = document.getElementById('active-rentals-section');
                            if (el) {
                              el.scrollIntoView({ behavior: 'smooth' });
                            }
                          }}
                          className="bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white text-[10px] font-bold px-3 py-2 rounded-lg shadow-sm transition-all cursor-pointer flex-1 text-center"
                        >
                          กดเพื่อไปหน้าคืนรถ ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowGuide(true)}
                          className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-[10px] font-bold px-3 py-2 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1"
                        >
                          <HelpCircle className="h-3 w-3 text-slate-500" />
                          วิธีคืนรถ
                        </button>
                      </div>
                    </motion.div>
                  )}

                  {/* Select Vehicle */}
                  <div className="relative" ref={dropdownRef}>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 font-display">เลือกรถที่ต้องการใช้งาน (ค้นหาได้)</label>
                    
                    {/* Unified Search & Select Combobox */}
                    <div className="relative">
                      <div className="relative flex items-center">
                        <input
                          type="text"
                          className="w-full bg-slate-50 hover:bg-slate-100 focus:bg-white border border-slate-200 rounded-lg pl-3 pr-16 py-2.5 text-sm text-slate-800 placeholder-slate-400 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all select-none"
                          placeholder="🔍 พิมพ์เพื่อค้นหาชื่อรถ ยี่ห้อ หรือทะเบียนรถ..."
                          value={isDropdownOpen ? searchQuery : (selectedVehicle ? `${selectedVehicle.name} (ทะเบียน ${selectedVehicle.plate})` : '')}
                          onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setIsDropdownOpen(true);
                          }}
                          onFocus={() => {
                            setIsDropdownOpen(true);
                            setSearchQuery('');
                          }}
                        />
                        <div className="absolute right-3 flex items-center gap-1.5">
                          {selectedVehicle && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedVehicleId('');
                                setSearchQuery('');
                              }}
                              className="text-slate-400 hover:text-slate-600 text-xs font-bold p-1 bg-slate-200/50 hover:bg-slate-200 rounded-full w-5 h-5 flex items-center justify-center transition-all cursor-pointer"
                              title="ล้างรถที่เลือก"
                            >
                              ✕
                            </button>
                          )}
                          <ChevronDown 
                            className={`h-4 w-4 text-slate-400 cursor-pointer transition-transform duration-200 ${isDropdownOpen ? 'transform rotate-180' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsDropdownOpen(!isDropdownOpen);
                            }}
                          />
                        </div>
                      </div>

                      {/* Dropdown Options Box */}
                      {isDropdownOpen && (
                        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-xl flex flex-col max-h-64 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
                          {/* Options Scroll Container */}
                          <div className="flex-1 overflow-y-auto divide-y divide-slate-50 max-h-60">
                            {filteredVehicles.length === 0 ? (
                              <div className="p-4 text-center text-xs text-slate-400">
                                ไม่พบข้อมูลรถยนต์ที่ค้นหา
                              </div>
                            ) : (
                              filteredVehicles.map((vehicle) => {
                                const isSelected = selectedVehicleId === vehicle.id;
                                const activeRental = logs.find(l => l.carId === vehicle.id && l.status === 'active');
                                
                                return (
                                  <button
                                    type="button"
                                    key={vehicle.id}
                                    disabled={!!activeRental}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedVehicleId(vehicle.id);
                                      setIsDropdownOpen(false);
                                      setSearchQuery('');
                                    }}
                                    className={`w-full text-left px-3 py-2.5 text-xs flex items-center justify-between transition-colors outline-none min-h-[44px] ${
                                      isSelected 
                                        ? 'bg-emerald-50 text-emerald-800 font-medium' 
                                        : activeRental 
                                        ? 'bg-slate-50 text-slate-400 cursor-not-allowed opacity-60'
                                        : 'hover:bg-slate-50 text-slate-700 active:bg-slate-100'
                                    }`}
                                  >
                                    <div className="truncate pr-2">
                                      <p className="font-semibold truncate text-slate-700">{vehicle.name}</p>
                                      <p className="text-[10px] text-slate-400 truncate mt-0.5">
                                        ทะเบียน: {vehicle.plate} • ประเภท: {vehicle.type}
                                      </p>
                                    </div>
                                    {activeRental ? (
                                      <span className="shrink-0 text-[9px] bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded-full font-semibold border border-amber-100">
                                        กำลังใช้งาน
                                      </span>
                                    ) : isSelected ? (
                                      <Check className="h-4 w-4 text-emerald-600 shrink-0 ml-2" />
                                    ) : null}
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Checkout Date & Time */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">วันที่เบิก</label>
                      <input 
                        type="date" 
                        required
                        value={outDate}
                        onChange={(e) => setOutDate(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none" 
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">เวลา</label>
                      <input 
                        type="time" 
                        required
                        value={outTime}
                        onChange={(e) => setOutTime(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none" 
                      />
                    </div>
                  </div>

                  {/* Battery & Mileage */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">ระดับแบตเตอรี่ (%)</label>
                      <input 
                        type="number" 
                        required
                        min="0"
                        max="100"
                        placeholder="0-100" 
                        value={outBattery}
                        onChange={(e) => setOutBattery(Number(e.target.value))}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono text-slate-700 focus:outline-none" 
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">เลขไมล์ปัจจุบัน (กม.)</label>
                      <input 
                        type="number" 
                        required
                        min="0"
                        placeholder="ตัวอย่าง 12450" 
                        value={outMileage || ''}
                        onChange={(e) => setOutMileage(Number(e.target.value))}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono text-slate-700 focus:outline-none" 
                      />
                    </div>
                  </div>

                  {/* Drag-and-drop & Click Photo Upload */}
                  <div 
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                  >
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">ถ่ายรูปสภาพรถ (บังคับ 5 รูป)</label>
                    
                    {/* Visual slots representation */}
                    <div className="grid grid-cols-5 gap-2">
                      {['หน้า', 'หลัง', 'ซ้าย', 'ขวา', 'ภายใน'].map((slot, index) => {
                        const isUploaded = photos[index] !== undefined;
                        return (
                          <div 
                            key={slot}
                            className={`aspect-square rounded-lg border-2 border-dashed flex flex-col items-center justify-center text-slate-400 bg-slate-50 overflow-hidden relative ${
                              isUploaded 
                                ? 'border-emerald-500 bg-emerald-50/10' 
                                : dragActive ? 'border-emerald-400' : 'border-slate-200'
                            }`}
                          >
                            {isUploaded ? (
                              <div className="w-full h-full relative group">
                                <img src={photos[index]} alt={slot} className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                  <span className="text-[9px] text-white font-bold uppercase">{slot}</span>
                                </div>
                              </div>
                            ) : (
                              <span className="text-[10px] font-bold">{slot}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <button 
                      type="button"
                      disabled={uploadingPhotos || photos.length >= 5}
                      onClick={() => document.getElementById('checkout-photos-selector')?.click()}
                      className="mt-3 w-full py-2 bg-slate-100 text-slate-600 rounded text-xs font-bold hover:bg-slate-200 transition-colors uppercase tracking-wide cursor-pointer disabled:opacity-50"
                    >
                      {uploadingPhotos ? 'กำลังจัดเตรียมไฟล์ภาพ...' : photos.length >= 5 ? 'อัปโหลดครบ 5 รูปแล้ว' : 'เลือกไฟล์รูปภาพ...'}
                    </button>
                    
                    <input 
                      type="file" 
                      id="checkout-photos-selector"
                      multiple
                      accept="image/*"
                      className="hidden" 
                      onChange={(e) => handleFileChange(e.target.files)}
                      disabled={uploadingPhotos || photos.length >= 5}
                    />

                    {photos.length > 0 && (
                      <div className="flex justify-between items-center mt-2 px-1">
                        <span className="text-[10px] text-slate-400 font-semibold font-mono">โหลดแล้ว {photos.length}/5 รูป</span>
                        <button 
                          type="button" 
                          onClick={clearPhotos}
                          className="text-[10px] font-bold text-rose-600 hover:underline cursor-pointer"
                        >
                          ล้างภาพเพื่อเลือกใหม่
                        </button>
                      </div>
                    )}
                  </div>

                </div>

                {/* Submit action panel */}
                <div className="p-6 border-t border-slate-100 bg-slate-50/50 rounded-b-xl shrink-0">
                  <button 
                    type="submit"
                    disabled={photos.length < 5 || !selectedVehicleId}
                    className={`w-full py-3.5 rounded-lg font-bold shadow-lg transition-all flex items-center justify-center gap-2 text-sm ${
                      photos.length === 5 && selectedVehicleId
                        ? 'bg-emerald-600 text-white shadow-emerald-600/20 hover:bg-emerald-700 cursor-pointer'
                        : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                    }`}
                  >
                    ยืนยันการบันทึกข้อมูล
                  </button>
                </div>
              </form>
            </section>

            {/* Right Column: Active Rentals & Inventory */}
            <section className="flex-1 flex flex-col gap-6 min-h-0 overflow-y-auto lg:overflow-hidden">
              
              {/* Active Rentals List */}
              <div id="active-rentals-section" className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col min-h-[300px] lg:min-h-0 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-4 bg-amber-400 rounded-full"></div>
                    <h2 className="font-bold text-slate-800 text-sm">รายการรถที่ยังไม่คืน (Active)</h2>
                  </div>
                  <span className="px-2.5 py-0.5 bg-amber-50 text-amber-700 text-[11px] font-bold rounded-full border border-amber-100">
                    {activeRentals.length} รายการ
                  </span>
                </div>
                
                <div className="flex-1 p-4 overflow-y-auto space-y-3">
                  {activeRentals.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 flex flex-col items-center justify-center gap-2">
                      <CheckCircle2 className="h-8 w-8 text-slate-300" />
                      <p className="text-xs font-semibold">ไม่มีรถยนต์ค้างคืนในขณะนี้</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">เริ่มทริปใหม่ได้จากแบบบันทึกด้านซ้าย</p>
                    </div>
                  ) : (
                    activeRentals.map((log) => {
                      const vehicle = VEHICLES.find(v => v.id === log.carId);
                      return (
                        <div key={log.id} className="group p-4 bg-white border border-slate-200 rounded-xl hover:border-amber-300 hover:shadow-md transition-all flex items-center justify-between gap-4">
                          <div className="flex gap-4 items-center min-w-0">
                            <div className="w-12 h-12 bg-slate-100 rounded-lg overflow-hidden shrink-0 flex items-center justify-center border border-slate-200">
                              {log.checkout.photos?.[0] ? (
                                <img src={log.checkout.photos[0]} alt={log.carName} className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-xs font-bold text-slate-400">PICS</span>
                              )}
                            </div>
                            <div className="min-w-0">
                              <h3 className="text-sm font-bold text-slate-900 leading-none mb-1 truncate">{log.carName}</h3>
                              <p className="text-xs text-slate-500 truncate">เบิกโดย: <span className="text-slate-700 font-medium">{log.userName}</span></p>
                              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
                                <span className="text-[10px] text-slate-400 uppercase font-bold">📅 {log.checkout.date}</span>
                                <span className="text-[10px] text-slate-400 uppercase font-bold">⏰ {log.checkout.time}</span>
                                <span className="text-[10px] text-emerald-600 uppercase font-bold font-mono">🔋 {log.checkout.battery}%</span>
                                <span className="text-[10px] text-slate-600 uppercase font-bold font-mono">🛣️ {log.checkout.mileage.toLocaleString()} กม.</span>
                              </div>
                            </div>
                          </div>
                          <button 
                            onClick={() => initiateReturn(log)}
                            className="px-4 py-2 shrink-0 bg-amber-500 text-white rounded-lg text-xs font-bold hover:bg-amber-600 shadow-sm cursor-pointer transition-all"
                          >
                            คืนรถ
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Inline Return Form (Conditionally rendered when active) */}
              {returningLog && (
                <div id="return-form-container" className="bg-white rounded-xl border border-amber-300 shadow-sm flex flex-col shrink-0 overflow-hidden">
                  <div className="px-6 py-4 bg-amber-50 border-b border-amber-100 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-4 bg-amber-500 rounded-full"></div>
                      <h3 className="font-bold text-amber-950 text-sm">แบบบันทึกการส่งคืนรถ: {returningLog.carName}</h3>
                    </div>
                    <button 
                      type="button"
                      onClick={() => setReturningLog(null)}
                      className="text-amber-800 hover:text-amber-950 text-xs font-bold px-2 py-1 bg-amber-100 hover:bg-amber-200 rounded transition-all cursor-pointer"
                    >
                      ยกเลิก
                    </button>
                  </div>
                  
                  <form onSubmit={handleReturnSubmit} className="p-6 space-y-5">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">วันที่คืน</label>
                        <input 
                          type="date" 
                          required 
                          value={returnDate} 
                          onChange={(e) => setReturnDate(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none" 
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">เวลาที่คืน</label>
                        <input 
                          type="time" 
                          required 
                          value={returnTime} 
                          onChange={(e) => setReturnTime(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none" 
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">ระดับแบตเตอรี่ขากลับ (%)</label>
                        <input 
                          type="number" 
                          required
                          min="0" 
                          max="100" 
                          value={returnBattery} 
                          onChange={(e) => setReturnBattery(Number(e.target.value))}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono text-slate-700 focus:outline-none" 
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
                          เลขไมล์เมื่อคืน (กม.) <span className="text-[10px] text-amber-600 font-normal">(ตอนออก: {returningLog.checkout.mileage} กม.)</span>
                        </label>
                        <input 
                          type="number" 
                          required 
                          min={returningLog.checkout.mileage}
                          value={returnMileage} 
                          onChange={(e) => setReturnMileage(Number(e.target.value))}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono text-slate-700 focus:outline-none" 
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">รายงานปัญหา / สภาพสภาพรถเมื่อส่งคืน</label>
                      <textarea 
                        rows={2} 
                        required
                        value={returnIssues} 
                        onChange={(e) => setReturnIssues(e.target.value)}
                        placeholder="กรอก 'ปกติ' หากไม่มีปัญหาความเสียหายใดๆ"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500/20" 
                      />
                    </div>

                    <button 
                      type="submit" 
                      className="w-full py-3 bg-amber-500 text-white rounded-lg font-bold hover:bg-amber-600 shadow-sm text-xs transition-colors cursor-pointer"
                    >
                      บันทึกการส่งคืนรถยนต์
                    </button>
                  </form>
                </div>
              )}

              {/* Company Fleet & History Tabs */}
              <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col min-h-[300px] lg:min-h-0 overflow-hidden">
                <div className="flex border-b border-slate-100 bg-slate-50/50 shrink-0">
                  <button
                    type="button"
                    onClick={() => setActiveTab('checkout')}
                    className={`flex-1 py-3 text-center text-xs font-bold uppercase tracking-wider transition-all border-b-2 cursor-pointer ${
                      activeTab === 'checkout'
                        ? 'border-emerald-600 text-slate-900 bg-white'
                        : 'border-transparent text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    กองยานพาหนะ ({VEHICLES.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('history')}
                    className={`flex-1 py-3 text-center text-xs font-bold uppercase tracking-wider transition-all border-b-2 cursor-pointer ${
                      activeTab === 'history'
                        ? 'border-emerald-600 text-slate-900 bg-white'
                        : 'border-transparent text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    ประวัติการเบิก-คืนทั้งหมด ({logs.length})
                  </button>
                </div>

                <div className="flex-1 p-4 overflow-y-auto">
                  {activeTab === 'checkout' && (
                    <div className="space-y-3">
                      {VEHICLES.map((vehicle) => {
                        const activeRental = logs.find(l => l.carId === vehicle.id && l.status === 'active');
                        return (
                          <div key={vehicle.id} className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 flex gap-3 items-center">
                            <div className="w-16 h-12 bg-slate-100 rounded-lg overflow-hidden shrink-0 border border-slate-200">
                              <img src={vehicle.image} alt={vehicle.name} className="w-full h-full object-cover" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between items-center gap-2">
                                <h4 className="font-bold text-slate-900 text-xs truncate">{vehicle.name}</h4>
                                <span className={`text-[9px] font-bold shrink-0 px-2.5 py-0.5 rounded-full ${
                                  activeRental 
                                    ? 'bg-amber-50 text-amber-700 border border-amber-100' 
                                    : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                }`}>
                                  {activeRental ? 'กำลังใช้งาน' : 'ว่าง'}
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-500 font-mono mt-0.5">ทะเบียน: {vehicle.plate} • {vehicle.type}</p>
                              {activeRental && (
                                <p className="text-[10px] text-amber-700 font-medium mt-1">ผู้เบิก: {activeRental.userName}</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {activeTab === 'history' && (
                    <div className="space-y-3">
                      {logs.length === 0 ? (
                        <div className="text-center py-12 text-slate-400 flex flex-col items-center justify-center gap-2">
                          <HelpCircle className="h-8 w-8 text-slate-300" />
                          <p className="text-xs font-semibold">ไม่พบประวัติบันทึกการใช้งานของคุณ</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">ทำรายการเบิกใช้งานได้จากฟอร์มซ้าย</p>
                        </div>
                      ) : (
                        logs.map((log) => {
                          const isExpanded = expandedLogId === log.id;
                          const isReturned = log.status === 'returned';
                          return (
                            <div 
                              key={log.id} 
                              className={`rounded-xl border transition-all overflow-hidden ${
                                isExpanded 
                                  ? 'border-emerald-600 bg-white shadow-sm' 
                                  : 'border-slate-100 bg-slate-50/50 hover:bg-slate-50'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => setExpandedLogId(isExpanded ? null : (log.id || null))}
                                className="w-full p-3.5 text-left flex items-center justify-between gap-3 cursor-pointer"
                              >
                                <div>
                                  <div className="flex items-center gap-2">
                                    <h4 className="font-bold text-slate-900 text-xs">{log.carName}</h4>
                                    <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${
                                      isReturned 
                                        ? 'bg-slate-200 text-slate-700' 
                                        : 'bg-amber-100 text-amber-800'
                                    }`}>
                                      {isReturned ? 'คืนแล้ว' : 'กำลังใช้งาน'}
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-slate-500 mt-1">เบิก: {log.checkout.date} ({log.checkout.time})</p>
                                </div>
                                <ChevronRight className={`h-4 w-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-90 text-slate-600' : ''}`} />
                              </button>

                              {isExpanded && (
                                <div className="border-t border-slate-100 bg-white p-4 space-y-4 text-xs">
                                  {/* Checkout log stats */}
                                  <div className="space-y-1.5">
                                    <p className="font-bold text-[10px] text-slate-400 uppercase tracking-wider">ข้อมูลขาออก (Checkout)</p>
                                    <div className="grid grid-cols-2 gap-2 bg-slate-50 rounded-lg p-2.5">
                                      <div>
                                        <p className="text-slate-400 text-[9px] font-semibold">แบตเตอรี่</p>
                                        <p className="font-mono text-slate-800 font-bold text-xs">{log.checkout.battery}%</p>
                                      </div>
                                      <div>
                                        <p className="text-slate-400 text-[9px] font-semibold">เลขไมล์</p>
                                        <p className="font-mono text-slate-800 font-bold text-xs">{log.checkout.mileage.toLocaleString()} กม.</p>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Photos list */}
                                  {log.checkout.photos && log.checkout.photos.length > 0 && (
                                    <div className="space-y-1.5">
                                      <p className="font-bold text-[10px] text-slate-400 uppercase tracking-wider">ภาพถ่ายสภาพรถ:</p>
                                      <div className="grid grid-cols-5 gap-1.5">
                                        {log.checkout.photos.map((url, i) => (
                                          <a 
                                            href={url} 
                                            key={i} 
                                            target="_blank" 
                                            rel="noreferrer" 
                                            className="aspect-square rounded border border-slate-200 overflow-hidden block hover:opacity-90"
                                          >
                                            <img src={url} alt={`checkout ${i}`} className="w-full h-full object-cover" />
                                          </a>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* Return details block if exists */}
                                  <div className="space-y-1.5 pt-2 border-t border-slate-100">
                                    <p className="font-bold text-[10px] text-slate-400 uppercase tracking-wider">ข้อมูลขากลับ (Return)</p>
                                    {isReturned && log.return ? (
                                      <div className="space-y-2">
                                        <div className="grid grid-cols-2 gap-2 bg-slate-50 rounded-lg p-2.5">
                                          <div>
                                            <p className="text-slate-400 text-[9px] font-semibold">แบตเตอรี่ขากลับ</p>
                                            <p className="font-mono text-slate-800 font-bold text-xs">{log.return.battery}%</p>
                                          </div>
                                          <div>
                                            <p className="text-slate-400 text-[9px] font-semibold">เลขไมล์ขากลับ</p>
                                            <p className="font-mono text-slate-800 font-bold text-xs">{log.return.mileage.toLocaleString()} กม.</p>
                                          </div>
                                        </div>
                                        
                                        <div className="bg-slate-50 rounded-lg p-2.5">
                                          <p className="text-slate-400 text-[9px] font-semibold">เวลาคืนรถ</p>
                                          <p className="font-semibold text-slate-800 mt-0.5">{log.return.date} ({log.return.time})</p>
                                        </div>

                                        <div className="bg-amber-50/40 border border-amber-100 rounded-lg p-2.5">
                                          <p className="text-amber-800 text-[9px] font-bold uppercase tracking-wider">ปัญหาระหว่างทาง / สภาพรถ</p>
                                          <p className="text-slate-800 mt-0.5 font-medium">{log.return.issues}</p>
                                        </div>
                                      </div>
                                    ) : (
                                      <p className="text-slate-400 text-[11px] italic">ยังไม่ได้ทำรายการคืนรถยนต์คันนี้</p>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-2 gap-6 h-32 shrink-0">
                <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col justify-between">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">ยานพาหนะพร้อมใช้</p>
                  <div className="flex items-end justify-between">
                    <h4 className="text-3xl font-light text-slate-900">{readyVehiclesCount} <span className="text-sm font-medium text-slate-400">คัน</span></h4>
                    <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
                      <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                    </div>
                  </div>
                </div>
                
                <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col justify-between shadow-sm shadow-emerald-50">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">ระยะทางรวมเดือนนี้</p>
                  <div className="flex items-end justify-between">
                    <h4 className="text-3xl font-light text-slate-900 italic tracking-tighter">
                      {totalDistance.toLocaleString()} <span className="text-sm font-medium text-slate-400 not-italic">กม.</span>
                    </h4>
                    <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 font-mono text-[10px] font-bold">
                      DATA
                    </div>
                  </div>
                </div>
              </div>

            </section>
          </main>

          {/* System Footer Status */}
          <footer className="h-10 bg-slate-900 text-slate-400 px-6 flex items-center justify-between text-[10px] uppercase font-bold shrink-0 tracking-widest">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                FIREBASE CONNECTED
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                FIRESTORE SYNC: OK
              </div>
            </div>
            <div>VERSION 1.0.4-BASE</div>
          </footer>

        </div>
      )}

      {/* User Guide Modal */}
      <AnimatePresence>
        {showGuide && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowGuide(false)}
          >
            <motion.div 
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-lg w-full overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <HelpCircle className="h-5 w-5 text-emerald-400" />
                  <h3 className="font-bold text-sm">คู่มือการใช้งานระบบบันทึกเบิก-คืนรถ</h3>
                </div>
                <button 
                  onClick={() => setShowGuide(false)} 
                  className="text-slate-400 hover:text-white transition-colors font-bold text-sm cursor-pointer p-1"
                >
                  ✕
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-6 space-y-6 overflow-y-auto max-h-[80vh]">
                
                {/* Section 1: Checkout */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-emerald-700 font-bold text-xs uppercase tracking-wider">
                    <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-[10px]">1</span>
                    ขั้นตอนการนำรถออก (Checkout)
                  </div>
                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-2.5 text-xs text-slate-600 leading-relaxed">
                    <p><b>1. เลือกรถยนต์:</b> พิมพ์ชื่อรถหรือเลขทะเบียนในช่องค้นหา (เช่น "dolphin" หรือเลขทะเบียน "9463") ระบบจะคัดกรองรถว่างให้ทันที</p>
                    <p><b>2. บันทึกข้อมูล:</b> ระบุวันที่ เวลา ระดับแบตเตอรี่ปัจจุบัน และเลขไมล์กิโลเมตรล่าสุดตอนเริ่มต้นใช้งาน</p>
                    <p><b>3. ถ่ายรูปสภาพรถ:</b> บังคับเลือก/ถ่ายรูปสภาพรถให้ครบถ้วนทั้ง 5 ด้านตามช่องที่ระบุ (หน้า, หลัง, ซ้าย, ขวา, ภายใน)</p>
                    <p><b>4. ยืนยัน:</b> ตรวจสอบข้อมูลแล้วกดปุ่ม "ยืนยันการบันทึกข้อมูล"</p>
                  </div>
                </div>

                {/* Section 2: Return */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-amber-700 font-bold text-xs uppercase tracking-wider">
                    <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-[10px]">2</span>
                    ขั้นตอนการส่งคืนรถยนต์ (Return)
                  </div>
                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-2.5 text-xs text-slate-600 leading-relaxed">
                    <p><b>1. หาคันที่ต้องการคืน:</b> ดูในหัวข้อ <b>"รายการรถที่ยังไม่คืน (Active)"</b> ด้านขวา (หรือเลื่อนลงด้านล่างสุดในมือถือ)</p>
                    <p><b>2. กดปุ่มคืนรถ:</b> กดปุ่มสีส้มที่เขียนว่า <span className="bg-amber-500 text-white font-bold px-1.5 py-0.5 rounded text-[10px]">คืนรถ</span> ข้างๆ รายละเอียดของรถคันนั้น</p>
                    <p><b>3. กรอกฟอร์มขากลับ:</b> ระบบจะแสดงฟอร์มสำหรับระบุแบตเตอรี่ขากลับ, เลขไมล์ขากลับ (ต้องมากกว่าตอนออก), และรายงานปัญหา/สภาพตัวรถ</p>
                    <p><b>4. บันทึกคืนรถ:</b> ตรวจทานความถูกต้องแล้วกดปุ่ม "บันทึกการส่งคืนรถยนต์"</p>
                  </div>
                </div>

                {/* Return Demonstration Info Box */}
                <div className="bg-sky-50 border border-sky-100 rounded-xl p-4 flex gap-3">
                  <CheckCircle2 className="h-5 w-5 text-sky-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-sky-950 leading-relaxed">
                    <h4 className="font-bold">หน้าตาปุ่มคืนรถอยู่ตรงไหน?</h4>
                    <p className="mt-1 text-sky-800">
                      สังเกตได้จากปุ่มสีส้มที่อยู่ถัดจากข้อมูลรถในหัวข้อ <b>"รายการรถที่ยังไม่คืน (Active)"</b> และหลังจากกดแล้ว ฟอร์มคืนรถสีเหลืองจะสไลด์เลื่อนเข้ามาหน้าจอเพื่อความสะดวกทันที!
                    </p>
                  </div>
                </div>

              </div>

              {/* Modal Footer */}
              <div className="bg-slate-50 border-t border-slate-100 px-6 py-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowGuide(false)}
                  className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs py-2 px-4 rounded-xl transition-all cursor-pointer"
                >
                  รับทราบและปิดคู่มือ
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
