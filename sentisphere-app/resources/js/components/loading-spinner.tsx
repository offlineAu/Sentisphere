import { cn } from '@/lib/utils';

interface LoadingSpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
    size?: 'sm' | 'md' | 'lg';
    className?: string;
}

export function LoadingSpinner({ size = 'md', className, ...props }: LoadingSpinnerProps) {
    const sizeClasses = {
        sm: 'h-4 w-4',
        md: 'h-8 w-8',
        lg: 'h-12 w-12',
    };

    return (
        <div
            className={cn(
                'inline-block animate-spin rounded-full border-2 border-current border-t-transparent text-primary',
                sizeClasses[size],
                className
            )}
            role="status"
            {...props}
        >
            <span className="sr-only">Loading...</span>
        </div>
    );
}
