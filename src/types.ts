export interface VehicleCheckout {
  date: string;
  time: string;
  battery: number;
  mileage: number;
  photos: string[];
}

export interface VehicleReturn {
  date: string;
  time: string;
  battery: number;
  mileage: number;
  issues: string;
}

export interface VehicleLog {
  id?: string;
  userEmail: string;
  userName: string;
  carId: string;
  carName: string;
  status: 'active' | 'returned';
  checkout: VehicleCheckout;
  return?: VehicleReturn | null;
  createdAt: any; // Timestamp or ISO string
  updatedAt: any; // Timestamp or ISO string
}

export interface Vehicle {
  id: string;
  name: string;
  plate: string;
  type: string;
  image: string;
}
