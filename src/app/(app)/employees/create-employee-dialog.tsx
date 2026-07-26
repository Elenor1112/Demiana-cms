"use client";
import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { apiSend } from "@/lib/fetcher";
import { ROLE_META } from "@/lib/rbac";

const schema = z.object({
  firstName: z.string().min(1, "Required"),
  lastName: z.string().min(1, "Required"),
  email: z.string().email("Invalid email"),
  roleKey: z.string().min(1, "Required"),
  jobTitle: z.string().optional(),
  departmentId: z.string().optional(),
  managerId: z.string().optional(),
  password: z.string().min(8, "Min 8 characters"),
});
type FormValues = z.infer<typeof schema>;

export function CreateEmployeeDialog({
  open,
  onClose,
  departments,
  employees,
}: {
  open: boolean;
  onClose: () => void;
  departments: { id: string; name: string }[];
  employees: { id: string; name: string }[];
}) {
  const qc = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { password: "" },
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) => apiSend("/api/employees", "POST", values),
    onSuccess: () => {
      toast.success("Employee added");
      qc.invalidateQueries({ queryKey: ["employees"] });
      reset();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onClose={onClose} title="Add employee" description="Create a new team member account.">
      <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" error={errors.firstName?.message}>
            <Input {...register("firstName")} />
          </Field>
          <Field label="Last name" error={errors.lastName?.message}>
            <Input {...register("lastName")} />
          </Field>
        </div>
        <Field label="Email" error={errors.email?.message}>
          <Input type="email" {...register("email")} placeholder="name@elenor.com" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Role" error={errors.roleKey?.message}>
            <Select {...register("roleKey")} defaultValue="">
              <option value="" disabled>Select role</option>
              {Object.entries(ROLE_META).map(([key, meta]) => (
                <option key={key} value={key}>{meta.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Job title">
            <Input {...register("jobTitle")} placeholder="e.g. Senior Designer" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Department">
            <Select {...register("departmentId")} defaultValue="">
              <option value="">None</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Manager">
            <Select {...register("managerId")} defaultValue="">
              <option value="">None</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Temporary password" error={errors.password?.message}>
          <Input type="text" {...register("password")} />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
            Create employee
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
