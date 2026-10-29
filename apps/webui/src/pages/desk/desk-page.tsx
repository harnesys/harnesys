import { Navigate, useParams } from 'react-router';
import { studioPath } from '@/shared/config/routes';

export function DeskPage() {
  const { orgId } = useParams();
  return <Navigate to={orgId ? studioPath.desk(orgId) : '/'} replace />;
}
