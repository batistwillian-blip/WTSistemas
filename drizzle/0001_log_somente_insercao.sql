-- O log de alterações só aceita inclusões: nem o próprio sistema consegue alterar ou apagar registros.
CREATE OR REPLACE FUNCTION log_alteracoes_imutavel() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'log_alteracoes é somente inclusão';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER log_alteracoes_sem_update_delete
  BEFORE UPDATE OR DELETE ON log_alteracoes
  FOR EACH ROW EXECUTE FUNCTION log_alteracoes_imutavel();
--> statement-breakpoint
CREATE TRIGGER log_alteracoes_sem_truncate
  BEFORE TRUNCATE ON log_alteracoes
  FOR EACH STATEMENT EXECUTE FUNCTION log_alteracoes_imutavel();
