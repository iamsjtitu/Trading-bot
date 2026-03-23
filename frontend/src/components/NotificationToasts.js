export default function NotificationToasts({ notifications, setNotifications }) {
  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-20 right-4 z-50 space-y-2 max-w-md" data-testid="notifications-container">
      {notifications.map((notif) => (
        <div key={notif.id} className={`p-4 rounded-lg shadow-lg border-l-4 animate-slide-in ${
          notif.type === 'success' ? 'bg-green-50 border-green-500 text-green-800' :
          notif.type === 'error' ? 'bg-red-50 border-red-500 text-red-800' :
          notif.type === 'warning' ? 'bg-yellow-50 border-yellow-500 text-yellow-800' :
          'bg-blue-50 border-blue-500 text-blue-800'
        }`} data-testid={`notification-${notif.type}`}>
          <div className="flex items-center justify-between">
            <p className="font-medium text-sm">{notif.message}</p>
            <button onClick={() => setNotifications(prev => prev.filter(n => n.id !== notif.id))} className="ml-4 text-gray-500 hover:text-gray-700">x</button>
          </div>
        </div>
      ))}
    </div>
  );
}
