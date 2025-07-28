import { ChartLineIcon, IndianRupeeIcon, PlayCircleIcon, StarIcon, UsersIcon } from 'lucide-react';
import React, { useEffect, useState } from 'react'
import Loading from '../../components/Loading';
import Title from '../../components/admin/Title';
import BlurCircle from '../../components/BlurCircle';
import { dateFormat } from '../../lib/dateFormat';
import { useAppContext } from '../../context/AppContext';
import toast from 'react-hot-toast';

const Dashboard = () => {
  const { axios, getToken, user, image_base_url } = useAppContext();
  const currency = import.meta.env.VITE_CURRENCY;

  const [dashboardData, setDashboardData] = useState({
    totalBookings: 0,
    totalRevenue: 0,
    activeShows: [],
    totalUser: 0
  });
  const [loading, setLoading] = useState(true);

  const dashboardCards = [
    { title: "Total Bookings", value: dashboardData.totalBookings || "0", icon: ChartLineIcon },
    { 
      title: "Total Revenue", 
      value: typeof dashboardData.totalRevenue === "number"
        ? currency + dashboardData.totalRevenue
        : currency + "0", 
      icon: IndianRupeeIcon 
    },
    { title: "Active Shows", value: dashboardData.activeShows.length || "0", icon: PlayCircleIcon },
    { title: "Total Users", value: dashboardData.totalUser || "0", icon: UsersIcon },
  ];

  const fetchDashboardData = async () => {
    try {
      const { data } = await axios.get('/api/admin/dashboard', {
        headers: { Authorization: `Bearer ${await getToken()}` }
      });
      
      if (data.success) {
        setDashboardData(data.dashboardData);
      } else {
        toast.error(data.message || 'Failed to fetch dashboard data');
      }
    } catch (error) {
      console.error('Dashboard data fetch error:', error);
      toast.error('Error fetching dashboard data. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchDashboardData();
    }
  }, [user]);

  // Auto-refresh every 30 seconds to keep data updated
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(() => {
      fetchDashboardData();
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [user]);

  if (loading) return <Loading />;

  return (
    <>
      <Title text1="Admin" text2="Dashboard" />

      <div className='relative flex-wrap gap-4 mt-6'>
        <BlurCircle top="-100px" left="0" />
        <div className='flex flex-wrap gap-4 w-full'>
          {dashboardCards.map((card, idx) => {
            const Icon = card.icon;
            return (
              <div
                key={idx}
                className="flex items-center justify-between px-4 py-3 bg-primary/10 border border-primary/20 rounded-md max-w-50 w-full"
              >
                <div>
                  <h1 className="text-sm">{card.title}</h1>
                  <p className="text-xl font-medium mt-1">{card.value}</p>
                </div>
                <Icon className="w-6 h-6" />
              </div>
            );
          })}
        </div>
      </div>

      <p className='mt-10 text-lg font-medium'>Active Shows</p>
      <div className='relative flex flex-wrap gap-6 mt-4 max-w-5xl'>
        <BlurCircle top='-100px' left="-10%" />
        {dashboardData.activeShows.map((show) => (
          <div
            key={show._id}
            className='w-55 rounded-lg overflow-hidden h-full pb-3 bg-primary/10 border border-primary/20 hover:-translate-y-1 transition duration-300'
          >
            <img
              src={image_base_url + show.movie.poster_path}
              alt={show.movie.title}
              className='h-60 w-full object-cover'
            />

            <p className='font-medium p-2 truncate'>{show.movie.title}</p>

            <div className='flex items-center justify-between px-2'>
              {/* Price on left, white */}
              <p className='text-sm text-white font-semibold'>
                {currency}{show.showPrice ?? show.price ?? 0}
              </p>

              {/* Rating on right */}
              <p className='flex items-center gap-1 text-sm text-gray-400 mt-1 pr-1'>
                <StarIcon className='w-4 h-4 text-primary fill-primary' />
                {show.movie.vote_average?.toFixed(1) || 'N/A'}
              </p>
            </div>

            <p className='px-2 pt-2 text-sm text-gray-500'>
              {dateFormat(show.showDateTime)}
            </p>
          </div>
        ))}
      </div>
    </>
  );
};

export default Dashboard;
