"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  title?: string;
  message?: string;
}

export function EmailAccountRequired({
  title = "Email",
  message = "Connect an email account first to use this feature.",
}: Props) {
  return (
    <div className="mx-auto h-full max-w-3xl p-6">
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{message}</p>
          <Button asChild>
            <Link href="/email/settings">Go to Email Settings</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
