'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/axios';
import { toast } from 'sonner';
import { Save, TestTube, CheckCircle, XCircle, Loader2, Server, Lock, Users, Settings } from 'lucide-react';
import { Protected } from '@/components/auth/protected';

interface LDAPConfig {
    id?: number;
    enabled: boolean;
    server_uri: string;
    bind_dn: string;
    bind_password?: string;  // Opcional para permitir delete
    user_search_base: string;
    user_search_filter: string;
    attr_username: string;
    attr_email: string;
    attr_first_name: string;
    attr_last_name: string;
    use_tls: boolean;
    require_group: string;
    admin_group_dn: string;
    last_test_status?: 'success' | 'failed' | 'pending';
    last_test_message?: string;
    last_test_at?: string;
}

export default function LDAPSettingsPage() {
    const [config, setConfig] = useState<LDAPConfig>({
        enabled: false,
        server_uri: '',
        bind_dn: '',
        bind_password: '',
        user_search_base: '',
        user_search_filter: '(uid=%(user)s)',
        attr_username: 'uid',
        attr_email: 'mail',
        attr_first_name: 'givenName',
        attr_last_name: 'sn',
        use_tls: false,
        require_group: '',
        admin_group_dn: '',
    });

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

    useEffect(() => {
        fetchConfig();
    }, []);

    const fetchConfig = async () => {
        try {
            const response = await api.get('/api/core/ldap-config/');
            if (response.data.results && response.data.results.length > 0) {
                const ldapConfig = response.data.results[0];
                setConfig({
                    ...ldapConfig,
                    bind_password: '', // Não retorna a senha por segurança
                });
            }
        } catch (error) {
            console.error('Erro ao carregar configuração LDAP:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const payload = { ...config };
            // Se senha está vazia, remove do payload (manter a existente)
            if (!payload.bind_password) {
                delete payload.bind_password;
            }

            if (config.id) {
                await api.put(`/api/core/ldap-config/${config.id}/`, payload);
            } else {
                await api.post('/api/core/ldap-config/', payload);
            }

            toast.success('Configuração salva com sucesso!');
            fetchConfig(); // Recarregar para pegar o ID se foi criação
        } catch (error: unknown) {
            console.error('Erro ao salvar configuração:', error);
            const detail = typeof error === 'object' && error !== null && 'response' in error
                ? (error as { response?: { data?: { detail?: string } } }).response?.data?.detail
                : undefined
            toast.error(detail || 'Erro ao salvar configuração');
        } finally {
            setSaving(false);
        }
    };

    const handleTestConnection = async () => {
        if (!config.id) {
            toast.error('Salve a configuração antes de testar a conexão');
            return;
        }

        setTesting(true);
        setTestResult(null);

        try {
            const response = await api.post(`/api/core/ldap-config/${config.id}/test_connection/`);
            setTestResult({
                success: response.data.success,
                message: response.data.message,
            });

            if (response.data.success) {
                toast.success('Conexão testada com sucesso!');
            } else {
                toast.error('Falha ao testar conexão');
            }
        } catch (error: unknown) {
            console.error('Erro ao testar conexão:', error);
            const message = typeof error === 'object' && error !== null && 'response' in error
                ? (error as { response?: { data?: { message?: string } } }).response?.data?.message || 'Erro ao conectar com o servidor LDAP'
                : 'Erro ao conectar com o servidor LDAP';
            setTestResult({
                success: false,
                message,
            });
            toast.error('Falha ao testar conexão');
        } finally {
            setTesting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <Protected requiredPermissions={['admin.settings_manage']}>
        <div className="container mx-auto py-8 px-4 max-w-4xl">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold mb-2">Configuração LDAP</h1>
                <p className="text-muted-foreground">
                    Configure a autenticação LDAP para permitir login de usuários do seu diretório corporativo.
                </p>
            </div>

            {/* Test Result Banner */}
            {testResult && (
                <div className={`p-4 rounded-lg border mb-6 ${testResult.success
                    ? 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800'
                    : 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800'
                    }`}>
                    <div className="flex items-start gap-3">
                        {testResult.success ? (
                            <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                        ) : (
                            <XCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1">
                            <pre className="text-sm font-mono whitespace-pre-wrap break-words">
                                {testResult.message}
                            </pre>
                        </div>
                    </div>
                </div>
            )}

            {/* Form */}
            <div className="space-y-6">
                {/* Enable Toggle */}
                <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                        <h3 className="font-semibold">Ativar LDAP</h3>
                        <p className="text-sm text-muted-foreground">
                            Habilitar autenticação via LDAP para este tenant
                        </p>
                    </div>
                    <button
                        onClick={() => setConfig({ ...config, enabled: !config.enabled })}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${config.enabled ? 'bg-primary' : 'bg-gray-200 dark:bg-gray-700'
                            }`}
                    >
                        <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${config.enabled ? 'translate-x-6' : 'translate-x-1'
                                }`}
                        />
                    </button>
                </div>

                {/* Server Configuration */}
                <div className="border rounded-lg p-6 space-y-4">
                    <div className="flex items-center gap-2 mb-4">
                        <Server className="h-5 w-5 text-primary" />
                        <h3 className="font-semibold text-lg">Configurações do Servidor</h3>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-2">
                            Server URI *
                        </label>
                        <input
                            type="text"
                            value={config.server_uri}
                            onChange={(e) => setConfig({ ...config, server_uri: e.target.value })}
                            placeholder="ldap://ldap.empresa.com:389"
                            className="w-full px-3 py-2 border rounded-md bg-background"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                            Ex: ldap://servidor:389 ou ldaps://servidor:636
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <input
                            type="checkbox"
                            checked={config.use_tls}
                            onChange={(e) => setConfig({ ...config, use_tls: e.target.checked })}
                            className="h-4 w-4"
                        />
                        <label className="text-sm font-medium">
                            Usar TLS/SSL
                        </label>
                    </div>
                </div>

                {/* Bind Credentials */}
                <div className="border rounded-lg p-6 space-y-4">
                    <div className="flex items-center gap-2 mb-4">
                        <Lock className="h-5 w-5 text-primary" />
                        <h3 className="font-semibold text-lg">Credenciais de Bind</h3>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-2">
                            Bind DN *
                        </label>
                        <input
                            type="text"
                            value={config.bind_dn}
                            onChange={(e) => setConfig({ ...config, bind_dn: e.target.value })}
                            placeholder="cn=admin,dc=empresa,dc=com"
                            className="w-full px-3 py-2 border rounded-md bg-background"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-2">
                            Bind Password *
                        </label>
                        <input
                            type="password"
                            value={config.bind_password}
                            onChange={(e) => setConfig({ ...config, bind_password: e.target.value })}
                            placeholder={config.id ? "••••••••" : "Digite a senha"}
                            className="w-full px-3 py-2 border rounded-md bg-background"
                        />
                        {config.id && (
                            <p className="text-xs text-muted-foreground mt-1">
                                Deixe em branco para manter a senha atual
                            </p>
                        )}
                    </div>
                </div>

                {/* User Search */}
                <div className="border rounded-lg p-6 space-y-4">
                    <div className="flex items-center gap-2 mb-4">
                        <Users className="h-5 w-5 text-primary" />
                        <h3 className="font-semibold text-lg">Busca de Usuários</h3>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-2">
                            User Search Base *
                        </label>
                        <input
                            type="text"
                            value={config.user_search_base}
                            onChange={(e) => setConfig({ ...config, user_search_base: e.target.value })}
                            placeholder="ou=users,dc=empresa,dc=com"
                            className="w-full px-3 py-2 border rounded-md bg-background"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-2">
                            User Search Filter
                        </label>
                        <input
                            type="text"
                            value={config.user_search_filter}
                            onChange={(e) => setConfig({ ...config, user_search_filter: e.target.value })}
                            placeholder="(uid=%(user)s)"
                            className="w-full px-3 py-2 border rounded-md bg-background"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                            Use %(user)s como placeholder para o username
                        </p>
                    </div>
                </div>

                {/* Attribute Mapping */}
                <div className="border rounded-lg p-6 space-y-4">
                    <div className="flex items-center gap-2 mb-4">
                        <Settings className="h-5 w-5 text-primary" />
                        <h3 className="font-semibold text-lg">Mapeamento de Atributos</h3>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-2">
                                Username Attribute
                            </label>
                            <input
                                type="text"
                                value={config.attr_username}
                                onChange={(e) => setConfig({ ...config, attr_username: e.target.value })}
                                placeholder="uid"
                                className="w-full px-3 py-2 border rounded-md bg-background"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-2">
                                Email Attribute
                            </label>
                            <input
                                type="text"
                                value={config.attr_email}
                                onChange={(e) => setConfig({ ...config, attr_email: e.target.value })}
                                placeholder="mail"
                                className="w-full px-3 py-2 border rounded-md bg-background"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-2">
                                First Name Attribute
                            </label>
                            <input
                                type="text"
                                value={config.attr_first_name}
                                onChange={(e) => setConfig({ ...config, attr_first_name: e.target.value })}
                                placeholder="givenName"
                                className="w-full px-3 py-2 border rounded-md bg-background"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-2">
                                Last Name Attribute
                            </label>
                            <input
                                type="text"
                                value={config.attr_last_name}
                                onChange={(e) => setConfig({ ...config, attr_last_name: e.target.value })}
                                placeholder="sn"
                                className="w-full px-3 py-2 border rounded-md bg-background"
                            />
                        </div>
                    </div>
                </div>

                {/* Advanced Options */}
                <details className="border rounded-lg">
                    <summary className="p-4 cursor-pointer font-semibold hover:bg-muted/50">
                        Opções Avançadas
                    </summary>
                    <div className="p-4 space-y-4 border-t">
                        <div>
                            <label className="block text-sm font-medium mb-2">
                                Require Group (Opcional)
                            </label>
                            <input
                                type="text"
                                value={config.require_group}
                                onChange={(e) => setConfig({ ...config, require_group: e.target.value })}
                                placeholder="cn=app-users,ou=groups,dc=empresa,dc=com"
                                className="w-full px-3 py-2 border rounded-md bg-background"
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                                DN do grupo que usuários devem pertencer para autenticar
                            </p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-2">
                                Admin Group DN (Opcional)
                            </label>
                            <input
                                type="text"
                                value={config.admin_group_dn}
                                onChange={(e) => setConfig({ ...config, admin_group_dn: e.target.value })}
                                placeholder="cn=admins,ou=groups,dc=empresa,dc=com"
                                className="w-full px-3 py-2 border rounded-md bg-background"
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                                Membros deste grupo terão permissões de administrador
                            </p>
                        </div>
                    </div>
                </details>

                {/* Actions */}
                <div className="flex gap-3 pt-4">
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-2 px-6 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
                    >
                        {saving ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Save className="h-4 w-4" />
                        )}
                        Salvar Configuração
                    </button>

                    <button
                        onClick={handleTestConnection}
                        disabled={testing || !config.id}
                        className="flex items-center gap-2 px-6 py-2 border rounded-md hover:bg-muted disabled:opacity-50"
                    >
                        {testing ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <TestTube className="h-4 w-4" />
                        )}
                        Testar Conexão
                    </button>
                </div>
            </div>
        </div>
        </Protected>
    );
}
