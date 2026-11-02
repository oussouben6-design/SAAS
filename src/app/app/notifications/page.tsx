import type { Metadata } from "next";
import Link from "next/link";
import { Bell, BellOff, Check, ExternalLink } from "lucide-react";
import { requireContext } from "@/lib/server/context";
import { listNotifications } from "@/modules/notifications/service";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { QuickActionButton } from "@/components/forms/quick-action";
import { markAllReadAction, markNotificationReadAction } from "@/modules/notifications/actions";
import { relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const context = await requireContext();
  const notifications = await listNotifications({
    userId: context.user.id,
    organizationId: context.organization!.id,
  });
  const unread = notifications.filter((notification) => !notification.read_at).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Notifications"
        description="Assignations de tâches, invitations et événements liés à votre compte."
        actions={
          unread > 0 ? (
            <QuickActionButton
              action={markAllReadAction}
              fields={{}}
              label="Tout marquer comme lu"
              icon={<Check className="size-4" />}
              successMessage="Notifications marquées comme lues."
            />
          ) : null
        }
      />

      {notifications.length === 0 ? (
        <EmptyState
          icon={<BellOff />}
          title="Aucune notification"
          description="Vous serez notifié lorsqu'une tâche vous sera assignée ou qu'un événement vous concernera."
        />
      ) : (
        <Card>
          <CardContent className="divide-y divide-border p-0">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={`flex flex-wrap items-start gap-3 px-4 py-3 ${notification.read_at ? "" : "bg-accent/30"}`}
              >
                <span className="mt-0.5 rounded-lg bg-muted p-2 text-muted-foreground">
                  <Bell className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {notification.title}
                    {!notification.read_at ? <Badge variant="primary">Nouveau</Badge> : null}
                  </p>
                  {notification.body ? <p className="text-sm text-muted-foreground">{notification.body}</p> : null}
                  <p className="mt-0.5 text-xs text-muted-foreground">{relativeTime(notification.created_at)}</p>
                </div>
                <div className="flex items-center gap-1">
                  {notification.link ? (
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={notification.link}>
                        Ouvrir <ExternalLink className="size-3.5" />
                      </Link>
                    </Button>
                  ) : null}
                  {!notification.read_at ? (
                    <QuickActionButton
                      action={markNotificationReadAction}
                      fields={{ id: notification.id }}
                      label="Marquer lu"
                      variant="ghost"
                      successMessage="Notification lue."
                    />
                  ) : null}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
