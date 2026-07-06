import { Toaster } from "@/components/ui/toaster"

import { QueryClientProvider } from '@tanstack/react-query'

import { queryClientInstance } from '@/lib/query-client'

import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';

import PageNotFound from './lib/PageNotFound';

import { AuthProvider } from '@/lib/AuthContext';

import ScrollToTop from './components/ScrollToTop';

import ProtectedRoute from '@/components/ProtectedRoute';

import AdminRoute from '@/components/AdminRoute';

import Login from '@/pages/Login';

import Register from '@/pages/Register';

import ForgotPassword from '@/pages/ForgotPassword';

import ResetPassword from '@/pages/ResetPassword';

import Layout from '@/components/Layout';

import Home from '@/pages/Home';

import Category from '@/pages/Category';

import ProductDetail from '@/pages/ProductDetail';

import AdminLayout from '@/pages/admin/AdminLayout';

import AdminDashboard from '@/pages/admin/AdminDashboard';

import AdminProducts from '@/pages/admin/AdminProducts';

import AdminOrders from '@/pages/admin/AdminOrders';

import AdminAffiliates from '@/pages/admin/AdminAffiliates';

import AdminSettings from '@/pages/admin/AdminSettings';

import Checkout from '@/pages/Checkout';

import PaymentReturn from '@/pages/PaymentReturn';

import PixPayment from '@/pages/PixPayment';

import Account from '@/pages/Account';

import InstitutionalPage from '@/pages/InstitutionalPage';

import AdminContent from '@/pages/admin/AdminContent';

import ApiStatus from '@/pages/ApiStatus';



function AppRoutes() {

  return (

    <Routes>

      <Route path="/login" element={<Login />} />

      <Route path="/register" element={<Register />} />

      <Route path="/forgot-password" element={<ForgotPassword />} />

      <Route path="/reset-password" element={<ResetPassword />} />

      <Route path="/diagnostico-api" element={<ApiStatus />} />



      <Route element={<Layout />}>

        <Route path="/" element={<Home />} />

        <Route path="/categoria/:slug" element={<Category />} />

        <Route path="/produto/:id" element={<ProductDetail />} />

        <Route path="/sobre-nos" element={<InstitutionalPage pageSlug="sobre-nos" />} />

        <Route path="/politica-de-privacidade" element={<InstitutionalPage pageSlug="politica-de-privacidade" />} />

        <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/conta" element={<Account />} />
          <Route path="/pagamento/retorno" element={<PaymentReturn />} />
          <Route path="/pagamento/pix" element={<PixPayment />} />
        </Route>

      </Route>



      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>

        <Route element={<AdminRoute />}>

          <Route element={<AdminLayout />}>

            <Route path="/admin" element={<AdminDashboard />} />

            <Route path="/admin/produtos" element={<AdminProducts />} />

            <Route path="/admin/pedidos" element={<AdminOrders />} />

            <Route path="/admin/afiliados" element={<AdminAffiliates />} />

            <Route path="/admin/configuracoes" element={<AdminSettings />} />

            <Route path="/admin/conteudo" element={<AdminContent />} />

          </Route>

        </Route>

      </Route>



      <Route path="*" element={<PageNotFound />} />

    </Routes>

  );

}



function App() {

  return (

    <AuthProvider>

      <QueryClientProvider client={queryClientInstance}>

        <Router>

          <ScrollToTop />

          <AppRoutes />

        </Router>

        <Toaster />

      </QueryClientProvider>

    </AuthProvider>

  );

}



export default App

