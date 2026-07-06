import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, AlertCircle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { getApiConfig, runApiDiagnostics } from '@/api/apiDiagnostics';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const LEVEL_STYLES = {
  success: 'text-green-700 bg-green-50 border-green-200',
  error: 'text-red-700 bg-red-50 border-red-200',
  warn: 'text-amber-800 bg-amber-50 border-amber-200',
  info: 'text-slate-700 bg-slate-50 border-slate-200',
};

function LogLine({ entry }) {
  const style = LEVEL_STYLES[entry.level] || LEVEL_STYLES.info;
  return (
    <div className={`rounded-md border px-3 py-2 text-sm font-mono ${style}`}>
      <div className="flex flex-wrap gap-x-2 gap-y-1 mb-1 text-xs opacity-80">
        <span>{new Date(entry.time).toLocaleTimeString('pt-BR')}</span>
        <span className="uppercase font-semibold">{entry.level}</span>
        <span>{entry.step}</span>
      </div>
      <p className="whitespace-pre-wrap break-all">{entry.message}</p>
      {entry.details && (
        <pre className="mt-2 text-xs overflow-x-auto opacity-90">
          {JSON.stringify(entry.details, null, 2)}
        </pre>
      )}
    </div>
  );
}

export default function ApiStatus() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [config] = useState(() => getApiConfig());

  const runTests = useCallback(async () => {
    setRunning(true);
    try {
      const diagnostics = await runApiDiagnostics();
      setResult(diagnostics);
    } finally {
      setRunning(false);
    }
  }, []);

  useEffect(() => {
    runTests();
  }, [runTests]);

  const lastError = result?.logs?.filter((l) => l.level === 'error').pop();

  return (
    <div className="min-h-screen bg-muted/30 py-10 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 text-primary mb-2">
            <Activity className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Diagnóstico da API</h1>
          <p className="text-muted-foreground text-sm">
            Verifica conexão com o backend e registra erros na tela
          </p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Configuração atual</CardTitle>
            <CardDescription>URLs detectadas pelo navegador</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm font-mono">
            <p><span className="text-muted-foreground">API em uso:</span> {config.resolved}</p>
            <p><span className="text-muted-foreground">sorelle-config.js:</span> {config.runtime || '(não definido)'}</p>
            <p><span className="text-muted-foreground">Build VITE_API_URL:</span> {config.build || '(não definido)'}</p>
            <p><span className="text-muted-foreground">Origem da loja:</span> {config.pageOrigin}</p>
            {config.crossOrigin && (
              <p className="text-amber-700">Cross-origin: API em domínio diferente da loja</p>
            )}
          </CardContent>
        </Card>

        {result && (
          <Card className={result.ok ? 'border-green-300' : 'border-red-300'}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                {result.ok ? (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                    API conectada
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-5 h-5 text-red-600" />
                    Falha na conexão
                  </>
                )}
              </CardTitle>
              {!result.ok && lastError && (
                <CardDescription className="text-red-600 font-medium">
                  {lastError.message}
                </CardDescription>
              )}
            </CardHeader>
          </Card>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base">Log de diagnóstico</CardTitle>
              <CardDescription>Cada etapa do teste de conexão</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={runTests} disabled={running}>
              {running ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Testar novamente
            </Button>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[28rem] overflow-y-auto">
            {running && !result && (
              <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
                <Loader2 className="w-5 h-5 animate-spin" />
                Testando conexão...
              </div>
            )}
            {result?.logs?.map((entry, i) => (
              <LogLine key={`${entry.time}-${entry.step}-${i}`} entry={entry} />
            ))}
          </CardContent>
        </Card>

        {!result?.ok && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">O que verificar na VPS</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
              <p>Backend Docker: <code className="text-xs bg-muted px-1 rounded">docker ps | grep sorelle-backend</code></p>
              <p>Health local: <code className="text-xs bg-muted px-1 rounded">curl http://127.0.0.1:3001/api/health</code></p>
              <p>SSL do subdomínio <code className="text-xs bg-muted px-1 rounded">api.sorellepresentes.com.br</code> no aaPanel</p>
              <p>Script: <code className="text-xs bg-muted px-1 rounded">bash deploy/docker/fix-backend.sh</code></p>
            </CardContent>
          </Card>
        )}

        <p className="text-center text-sm text-muted-foreground">
          <Link to="/" className="text-primary hover:underline">← Voltar à loja</Link>
          {' · '}
          <Link to="/login" className="text-primary hover:underline">Login</Link>
        </p>
      </div>
    </div>
  );
}
